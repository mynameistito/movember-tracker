import { DEFAULT_MEMBER_ID } from "./constants.js";
import { observeTracking } from "./tracking-query.js";

const mount = (): void => {
  const container = document.querySelector<HTMLElement>("#overlayContainer");
  const amount = document.querySelector<HTMLElement>("#amount");
  const target = document.querySelector<HTMLElement>("#target");
  const progress = document.querySelector<HTMLElement>("#progressBar");
  const track = document.querySelector<HTMLElement>(".track");
  const status = document.querySelector<HTMLElement>("#status");

  if (!container || !amount || !target) {
    return;
  }

  if (!progress || !track || !status) {
    return;
  }

  const params = new URLSearchParams(location.search);
  const teamId = params.get("teamId") ?? params.get("teamid");

  const memberId =
    params.get("memberId") ?? params.get("memberid") ?? DEFAULT_MEMBER_ID;

  const id = teamId ?? memberId;
  const position = params.get("location")?.toLowerCase() ?? "bottomright";
  container.dataset.position = [
    "topleft",
    "topright",
    "bottomleft",
    "bottomright",
  ].includes(position)
    ? position
    : "bottomright";
  const seconds = Number(params.get("interval") ?? 300);

  const interval =
    Number.isFinite(seconds) && seconds > 0
      ? Math.min(Math.max(seconds, 30), 3600) * 1000
      : 300_000;

  if (/^\d+$/u.test(id)) {
    const dispose = observeTracking(
      { type: teamId === null ? "member" : "team", id },
      interval,
      (data, failed) => {
        status.textContent = failed ? "Connection interrupted · retrying" : "";

        if (!data) {
          amount.textContent = failed ? "Temporarily unavailable" : "Loading…";

          return;
        }

        amount.textContent = data.amount;
        target.textContent =
          data.target === undefined ? "" : `Goal ${data.target}`;
        const percentage = Math.min(100, Math.max(0, data.percentage ?? 0));
        progress.style.width = `${percentage}%`;
        track.setAttribute("aria-valuenow", String(percentage));
      }
    );

    window.addEventListener("pagehide", dispose, { once: true });
  } else {
    amount.textContent = "Invalid Movember ID";
    status.textContent = "Use a numeric memberId or teamId in the overlay URL.";
  }
};

mount();
