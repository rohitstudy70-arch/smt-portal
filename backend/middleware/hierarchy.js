const User = require('../models/User');

const PORTAL_ROLES = {
  ADMIN: 'ADMIN',
  DEALER: 'DEALER',
  SUB_DEALER: 'SUB_DEALER',
};

const getPortalRole = (user) => {
  if (!user) return null;
  if (user.role === 'partner') return PORTAL_ROLES.ADMIN;
  if (user.userType === 'Administration') return PORTAL_ROLES.ADMIN;
  if (user.userType === 'Sub Dealer') return PORTAL_ROLES.SUB_DEALER;
  if (user.userType === 'End Customer') return null;
  return PORTAL_ROLES.DEALER;
};

const labelForUser = (user) => user?.displayName || user?.companyName || user?.username || '';

const getDescendantUsers = async (rootUserId) => {
  const descendants = [];
  let frontier = [rootUserId];

  while (frontier.length > 0) {
    const children = await User.find({ parentId: { $in: frontier } }).select('-password');
    if (children.length === 0) break;

    descendants.push(...children);
    frontier = children.map((child) => child._id);
  }

  return descendants;
};

const getHierarchyScope = async (user) => {
  const role = getPortalRole(user);
  if (!role) {
    return {
      role,
      users: [],
      userIds: [],
      userNames: [],
    };
  }

  if (role === PORTAL_ROLES.ADMIN) {
    const users = await User.find({}).select('-password');
    return {
      role,
      users,
      userIds: users.map((item) => item._id),
      userNames: users.map(labelForUser).filter(Boolean),
    };
  }

  const descendants = await getDescendantUsers(user._id);
  const users = [user, ...descendants];

  return {
    role,
    users,
    userIds: users.map((item) => item._id),
    userNames: users.map(labelForUser).filter(Boolean),
  };
};

const isIdInScope = (scope, id) => {
  if (!id) return false;
  return scope.userIds.some((scopeId) => scopeId.toString() === id.toString());
};

const buildScopedOwnerQuery = (scope, userField = 'userId') => (
  scope.role === PORTAL_ROLES.ADMIN ? {} : { [userField]: { $in: scope.userIds } }
);

const buildDeviceScopeQuery = (scope) => {
  if (scope.role === PORTAL_ROLES.ADMIN) {
    return {};
  }

  return {
    $or: [
      { userId: { $in: scope.userIds } },
      { assignedTo: { $in: scope.userIds } },
      { dealerId: { $in: scope.userIds } },
      { subDealerId: { $in: scope.userIds } },
      { createdBy: { $in: scope.userIds } },
    ],
  };
};

const ensureUserInHierarchy = async (targetUserId, scope, { allowSelf = true } = {}) => {
  if (!targetUserId) return null;

  const target = await User.findById(targetUserId).select('-password');
  if (!target) return null;

  if (scope.role === PORTAL_ROLES.ADMIN) {
    return target;
  }

  const visible = isIdInScope(scope, target._id);
  if (!visible) return null;

  if (!allowSelf && target._id.toString() === scope.users[0]?._id?.toString()) {
    return null;
  }

  return target;
};

const attachHierarchyScope = async (req, res, next) => {
  try {
    req.portalRole = getPortalRole(req.user);
    if (!req.portalRole) {
      return res.status(403).json({ message: 'Forbidden: This account type is no longer supported.' });
    }
    req.hierarchyScope = await getHierarchyScope(req.user);
    next();
  } catch (error) {
    console.error('Hierarchy middleware error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

const requireRoles = (...allowedRoles) => (req, res, next) => {
  const role = req.portalRole || getPortalRole(req.user);

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ message: 'Forbidden: You do not have permission to access this resource.' });
  }

  next();
};

module.exports = {
  PORTAL_ROLES,
  getPortalRole,
  labelForUser,
  getDescendantUsers,
  getHierarchyScope,
  isIdInScope,
  buildScopedOwnerQuery,
  buildDeviceScopeQuery,
  ensureUserInHierarchy,
  attachHierarchyScope,
  requireRoles,
};
