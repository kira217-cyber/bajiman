import React from "react";

// Red blinking badge — shown only while something is waiting (0 = nothing)
const PendingBadge = ({ count, className = "" }) =>
  count > 0 ? (
    <span className={`ad-pending-badge ${className}`} title={`${count} pending`}>
      {count > 99 ? "99+" : count}
    </span>
  ) : null;

export default PendingBadge;
