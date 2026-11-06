import { DEFAULT_MEMBER_ID } from "./constants.js";

const mount = (): void => {
  const form = document.querySelector<HTMLFormElement>("#setup");
  const frame = document.querySelector<HTMLIFrameElement>("#preview");
  const output = document.querySelector<HTMLInputElement>("#overlay-url");
  const copy = document.querySelector<HTMLButtonElement>("#copy-url");
  const feedback = document.querySelector<HTMLElement>("#feedback");
  const open = document.querySelector<HTMLAnchorElement>("#open-overlay");
  const id = document.querySelector<HTMLInputElement>("#tracking-id");
  const type = document.querySelector<HTMLSelectElement>("#tracking-type");

  if (!form || !frame || !output || !copy) {
    return;
  }

  if (!feedback || !open || !id || !type) {
    return;
  }

  const params = new URLSearchParams(location.search);

  const teamId =
    [params.get("teamId"), params.get("teamid")].find(
      (value) => value !== null && value !== ""
    ) ?? null;

  type.value = teamId === null ? "member" : "team";
  id.value =
    teamId ??
    [params.get("memberId"), params.get("memberid")].find(
      (value) => value !== null && value !== ""
    ) ??
    DEFAULT_MEMBER_ID;

  const resize = new ResizeObserver(() => {
    frame.style.transform = `scale(${(frame.parentElement?.clientWidth ?? 1920) / 1920})`;
  });

  if (frame.parentElement) {
    resize.observe(frame.parentElement);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const values = new FormData(form);
    const url = new URL("/overlay", location.origin);
    url.searchParams.set(
      type.value === "team" ? "teamId" : "memberId",
      id.value
    );
    const position = values.get("location");
    const refresh = values.get("interval");
    url.searchParams.set(
      "location",
      position instanceof File ? "bottomright" : (position ?? "bottomright")
    );
    url.searchParams.set(
      "interval",
      refresh instanceof File ? "300" : (refresh ?? "300")
    );
    output.value = url.href;
    open.href = url.href;
    open.hidden = false;
    frame.src = url.href;
    document.querySelector<HTMLElement>("#preview-placeholder")?.remove();
    copy.disabled = false;
    feedback.textContent =
      "Overlay ready. Copy the URL into your OBS Browser source.";
  });

  const copyUrl = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(output.value);
      feedback.textContent = "Overlay URL copied.";
    } catch {
      output.select();
      feedback.textContent = "Select and copy the URL above.";
    }
  };

  copy.addEventListener("click", () => {
    void copyUrl();
  });
};

mount();
