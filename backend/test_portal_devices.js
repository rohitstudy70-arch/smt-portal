require('dotenv').config();
const mongoose = require('mongoose');
const DuePayment = require('./models/DuePayment');
const User = require('./models/User');
const Device = require('./models/Device');
const DealerDue = require('./models/DealerDue');
const RenewalRequest = require('./models/RenewalRequest');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://rohitstudy70_db_user:UkTQ7NsQChvV6b2q@cluster0.egh9cim.mongodb.net/?appName=Cluster0';

const getPortalRole = (user) => {
  if (!user) return null;
  if (user.role === 'partner') return 'ADMIN';
  if (user.userType === 'Administration') return 'ADMIN';
  if (user.userType === 'Sub Dealer') return 'SUB_DEALER';
  return 'DEALER';
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

const getDueUsersForScope = async (scope, currentUser) => {
  if (scope.role === 'ADMIN') {
    return scope.users.filter((user) => (
      ['DEALER', 'SUB_DEALER'].includes(getPortalRole(user))
    ));
  }
  return [];
};

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
};

const startOfMonth = (d = new Date()) => {
  const date = new Date(d);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfMonth = (d = new Date()) => {
  const date = new Date(d);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  date.setHours(23, 59, 59, 999);
  return date;
};

const sumPayments = async (match) => {
  const [summary] = await DuePayment.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return summary?.total || 0;
};

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const adminUser = await User.findOne({ username: 'ArshiEnterprises' });
    if (!adminUser) {
      console.log('User ArshiEnterprises not found');
      process.exit(1);
    }

    const scope = await getHierarchyScope(adminUser);
    const users = await getDueUsersForScope(scope, adminUser);
    const userIds = users.map((user) => user._id);
    const allUserIds = [...userIds, adminUser._id];

    console.log(`Scoped users count: ${users.length}`);

    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    console.log(`Month Start: ${monthStart.toISOString()}`);
    console.log(`Month End: ${monthEnd.toISOString()}`);

    const [todaysCollection, monthlyCollection] = await Promise.all([
      sumPayments({ userId: { $in: userIds }, paymentDate: { $gte: todayStart, $lte: todayEnd } }),
      sumPayments({ userId: { $in: userIds }, paymentDate: { $gte: monthStart, $lte: monthEnd } }),
    ]);

    console.log(`todaysCollection (Admin): ₹${todaysCollection}`);
    console.log(`monthlyCollection (Admin): ₹${monthlyCollection}`);

    // Let's also check if the logged in user was Link Birds (Dealer)
    const dealerUser = await User.findOne({ username: 'sunil@cdb.in' });
    const dealerScope = await getHierarchyScope(dealerUser);
    
    // Check what is returned if we treat it as dealer
    const dealerSelfId = dealerUser._id;
    const dealerTodayStart = startOfDay();
    const dealerTodayEnd = endOfDay();
    const dealerMonthStart = startOfMonth(new Date());
    const dealerMonthEnd = endOfMonth(new Date());

    const dealerTodaysDevicePayments = await sumPayments({
      userId: dealerSelfId,
      paymentDate: { $gte: dealerTodayStart, $lte: dealerTodayEnd }
    });

    const dealerMonthlyDevicePayments = await sumPayments({
      userId: dealerSelfId,
      paymentDate: { $gte: dealerMonthStart, $lte: dealerMonthEnd }
    });

    console.log('\n--- If Dealer (Link Birds) logs in: ---');
    console.log(`Dealer User ID: ${dealerSelfId}`);
    console.log(`Dealer todaysDevicePayments: ₹${dealerTodaysDevicePayments}`);
    console.log(`Dealer monthlyDevicePayments: ₹${dealerMonthlyDevicePayments}`);

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
