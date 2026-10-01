import User from "../models/User.js";

// Shared between manual and auto withdraw so a user can never have two
// withdraw requests racing to create their DB row at the same moment —
// the "do I already have a pending withdraw" check each route does first
// can't see a row the other request hasn't created yet, so this lock
// closes that narrow gap. Held only for the duration of one request.
const HOLD_MS = 30 * 1000;

export const lockWithdraw = async (userId) => {
  const now = new Date();

  const result = await User.updateOne(
    {
      _id: userId,
      $or: [{ withdrawBusyUntil: null }, { withdrawBusyUntil: { $lt: now } }],
    },
    { $set: { withdrawBusyUntil: new Date(now.getTime() + HOLD_MS) } },
  );

  return result.modifiedCount === 1;
};

export const unlockWithdraw = (userId) =>
  User.updateOne(
    { _id: userId },
    { $set: { withdrawBusyUntil: null } },
  ).catch(() => {});
