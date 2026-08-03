(() => {
  const splashDurationMs = 1500;
  const fadeDurationMs = 220;

  function dismissLaunchAnimation() {
    const launchAnimation = document.querySelector("#launchAnimation");
    document.body.classList.remove("launch-active");
    if (!launchAnimation) return;
    launchAnimation.classList.add("is-closing");
    window.setTimeout(() => launchAnimation.remove(), fadeDurationMs);
  }

  window.setTimeout(dismissLaunchAnimation, splashDurationMs);
})();
