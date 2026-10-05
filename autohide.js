// Pure state machine, independent of native keyboard hooks.
function createAutoHide({ leaveDelay = 500, openGrace = 800 } = {}) {
  let outsideSince = null, dragging = false, wasDown = false;
  return function tick({now, shownAt, enabled, visible, blocked, overUi, leftDown}) {
    const freshClick = leftDown && !wasDown;
    wasDown = leftDown;
    if (!enabled || !visible || blocked) { outsideSince = null; dragging = false; return false; }
    if (overUi) { outsideSince = null; dragging = !!leftDown; return false; }
    if (dragging && leftDown) { outsideSince = null; return false; }
    if (!leftDown) dragging = false;
    if (now - shownAt < openGrace) { outsideSince = null; return false; }
    if (freshClick) { outsideSince = null; return true; }
    if (outsideSince === null) outsideSince = now;
    if (now - outsideSince >= leaveDelay) { outsideSince = null; return true; }
    return false;
  };
}
module.exports = { createAutoHide };
