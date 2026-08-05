(() => {
  const splashDurationMs = 1500;
  const fadeDurationMs = 220;
  const launchAnimation = document.querySelector("#launchAnimation");
  let closeTimer = 0;
  let finishTimer = 0;
  let running = false;
  let waiters = [];

  function restartGif() {
    const image = launchAnimation?.querySelector("img");
    if (!image) return;
    const replacement = image.cloneNode(true);
    replacement.removeAttribute("data-launch-complete");
    image.replaceWith(replacement);
  }

  function finishLaunchAnimation() {
    if (!launchAnimation) return;
    launchAnimation.hidden = true;
    launchAnimation.classList.remove("is-closing");
    launchAnimation.setAttribute("aria-hidden", "true");
    running = false;
    const completed = waiters;
    waiters = [];
    completed.forEach((resolve) => resolve());
  }

  function dismissLaunchAnimation() {
    document.body.classList.remove("launch-active");
    if (!launchAnimation || !running) return;
    launchAnimation.classList.add("is-closing");
    finishTimer = window.setTimeout(finishLaunchAnimation, fadeDurationMs);
  }

  function playLaunchAnimation() {
    const completion = new Promise((resolve) => waiters.push(resolve));
    if (!launchAnimation) {
      const completed = waiters;
      waiters = [];
      completed.forEach((resolve) => resolve());
      return completion;
    }
    if (running) return completion;

    running = true;
    window.clearTimeout(closeTimer);
    window.clearTimeout(finishTimer);
    launchAnimation.hidden = false;
    launchAnimation.classList.remove("is-closing");
    launchAnimation.setAttribute("aria-hidden", "false");
    document.body.classList.add("launch-active");
    restartGif();
    closeTimer = window.setTimeout(dismissLaunchAnimation, splashDurationMs);
    return completion;
  }

  window.SportsCalendarLaunch = Object.freeze({
    play: playLaunchAnimation,
    isRunning: () => running
  });
  playLaunchAnimation();
})();
