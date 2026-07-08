require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('./models/Device');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://rohitstudy70_db_user:UkTQ7NsQChvV6b2q@cluster0.egh9cim.mongodb.net/?appName=Cluster0';

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

const getPortalRole = (user) => {
  if (!user) return null;
  if (user.role === 'partner') return 'ADMIN';
  if (user.userType === 'Administration') return 'ADMIN';
  if (user.userType === 'Sub Dealer') return 'SUB_DEALER';
  return 'DEALER';
};

const labelForUser = (user) => user?.displayName || user?.companyName || user?.username || '';

const getScope = async (user) => {
  const role = getPortalRole(user);

  if (role === 'ADMIN') {
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

const buildDeviceScopeQuery = (scope) => {
  if (scope.role === 'ADMIN') {
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

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const linkBirds = await User.findOne({ username: 'sunil@cdb.in' });
    if (!linkBirds) {
      console.log('User sunil@cdb.in not found');
      process.exit(1);
    }

    const scope = await getScope(linkBirds);
    const query = buildDeviceScopeQuery(scope);

    const devices = await Device.find(query)
      .populate('assignedTo', 'displayName username userType mobileNo email')
      .populate('dealerId', 'displayName companyName username userType')
      .populate('subDealerId', 'displayName companyName username userType')
      .populate('createdBy', 'displayName companyName username userType')
      .sort({ createdAt: -1 });

    console.log('--- GET /portal/devices Simulation ---');
    console.log(`Returned devices length: ${devices.length}`);

    // Print first 5 devices
    console.log('First 5 devices:');
    devices.slice(0, 5).forEach((d, i) => {
      console.log(`${i+1}: IMEI: ${d.imei} | AssignedTo: ${d.assignedTo ? d.assignedTo.username : 'null'} | dealerId: ${d.dealerId ? d.dealerId.username : 'null'}`);
    });

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
