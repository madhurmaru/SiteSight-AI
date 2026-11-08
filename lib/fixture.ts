export const fixtureModel = {
  name: "SiteSight illustrated fixture",
  version: "1.0",
  classes: ["worker", "helmet", "vest"],
  license:
    "CC0 original SiteSight illustrations; deterministic annotations, no accuracy claim",
};
export function fixtureDetections(mediaId: string) {
  return [
    {
      id: mediaId + "-w1",
      class: "worker",
      confidence: 0.97,
      box: [0.34, 0.49, 0.09, 0.36],
      workerId: mediaId + "-w1",
    },
    {
      id: mediaId + "-h1",
      class: "helmet",
      confidence: 0.96,
      box: [0.36, 0.49, 0.05, 0.055],
      workerId: mediaId + "-w1",
    },
    {
      id: mediaId + "-v1",
      class: "vest",
      confidence: 0.94,
      box: [0.35, 0.565, 0.065, 0.14],
      workerId: mediaId + "-w1",
    },
    {
      id: mediaId + "-w2",
      class: "worker",
      confidence: 0.91,
      box: [0.66, 0.45, 0.09, 0.38],
      workerId: mediaId + "-w2",
    },
    {
      id: mediaId + "-v2",
      class: "vest",
      confidence: 0.89,
      box: [0.675, 0.53, 0.06, 0.14],
      workerId: mediaId + "-w2",
    },
    {
      id: mediaId + "-w3",
      class: "worker",
      confidence: 0.6,
      box: [0.83, 0.51, 0.035, 0.12],
      workerId: mediaId + "-w3",
    },
  ];
}
export function fixtureFindings(mediaId: string, inspectionId: string) {
  return [
    {
      suffix: "helmet",
      kind: "helmet",
      assessment: "missing",
      title: "Possible missing helmet",
      workerId: mediaId + "-w2",
    },
    {
      suffix: "vest",
      kind: "vest",
      assessment: "present",
      title: "Safety vest appears present",
      workerId: mediaId + "-w2",
    },
    {
      suffix: "present",
      kind: "helmet-and-vest",
      assessment: "present",
      title: "Helmet and vest appear present",
      workerId: mediaId + "-w1",
    },
    {
      suffix: "unknown",
      kind: "visibility",
      assessment: "unknown",
      title: "Distant worker — unable to assess PPE",
      workerId: mediaId + "-w3",
    },
  ].map((f) => ({
    id: mediaId + "-" + f.suffix,
    inspectionId,
    mediaId,
    kind: f.kind,
    assessment: f.assessment,
    title: f.title,
    workerId: f.workerId,
    original: JSON.stringify({ ...f, fixture: true, model: fixtureModel }),
  }));
}
export function siteSvg(variant = 0) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#b8cdd3"/><stop offset="1" stop-color="#e6e7dd"/></linearGradient><linearGradient id="ground" x2="0" y2="1"><stop stop-color="#b8ad95"/><stop offset="1" stop-color="#8e8e80"/></linearGradient><pattern id="grid" width="130" height="115" patternUnits="userSpaceOnUse"><rect width="130" height="115" fill="#414e4f"/><rect x="12" y="12" width="105" height="90" fill="#657170"/><path d="M0 0H130V115" fill="none" stroke="#c5c3ad" stroke-width="17"/></pattern><filter id="noise"><feTurbulence baseFrequency=".7" numOctaves="3" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".09"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs><g filter="url(#noise)"><path fill="url(#sky)" d="M0 0h1200v760H0z"/><path fill="#9caeaa" d="M0 250l170-85 130 83 100-70 160 102 200-60 220 40 120-30v330H0z"/><path fill="url(#ground)" d="M0 440l1200-40v360H0z"/><path fill="#c6c1af" d="M80 110h780v380H80z"/><path fill="url(#grid)" d="M95 125h750v350H95z"/><path fill="#8f9488" d="M860 110l230 120v265l-230-5z"/><path d="M890 150v335m75-295v300m75-260v260M863 220l227 94M863 330l227 70" stroke="#c9c6b1" stroke-width="17"/><path d="M55 116h825M55 235h825M55 350h825M55 470h825" stroke="#d4d0bd" stroke-width="19"/><path d="M40 145h860M40 285h860M40 420h860M40 60v490m200-490v490m200-490v490m200-490v490m200-490v490M40 145l200 140 200-140 200 140 200-140M40 285l200 135 200-135 200 135 200-135" fill="none" stroke="#6f7c76" stroke-width="4"/><path d="M990 0v340M940 45h260M940 65h260M1060 65v210" stroke="#bb8748" stroke-width="9"/><path d="M0 595l1200-105M0 720l1200-150" stroke="#c6bda9" stroke-width="4"/><g fill="#796f5e"><path d="M80 525l210-14 100 57-220 30z"/><path d="M780 640l250-30 100 50-250 40z"/></g><g stroke="#a49475" stroke-width="12"><path d="M55 518l235-13m-215 31l235-13m-215 31l235-13m480 90l240-30m-210 47l240-30"/></g><g transform="translate(408 372)"><ellipse cx="55" cy="268" rx="62" ry="12" fill="#64695e" opacity=".35"/><path d="M32 154l-9 107h27l12-87 9 87h27L83 153z" fill="#35454d"/><path d="M27 75l-17 83 18 8 15-64h33l20 61 17-7-26-80z" fill="#4d6268"/><path d="M29 58h52l13 106H21z" fill="#dcb44f"/><path d="M34 62l7 94m27-94l-3 94M25 126h64" stroke="#e8e9bd" stroke-width="8"/><ellipse cx="55" cy="35" rx="23" ry="28" fill="#aa8368"/><path d="M28 24q1-28 27-28t28 28z" fill="#efc84d"/><path d="M22 26h68" stroke="#f4ce54" stroke-width="8"/><path d="M18 264h33m20 0h35" stroke="#293b40" stroke-width="12"/></g><g transform="translate(792 342)"><ellipse cx="52" cy="285" rx="65" ry="13" fill="#64695e" opacity=".35"/><path d="M29 163l-6 113h28l9-89 12 89h27L82 163z" fill="#394d59"/><path d="M24 83L7 175l18 4 18-76h33l22 72 19-8-29-85z" fill="#52687a"/><path d="M29 65h51l16 105H22z" fill="#d98943"/><path d="M35 69l6 94m26-94l-3 94M25 134h64" stroke="#e9e6ac" stroke-width="8"/><ellipse cx="55" cy="40" rx="22" ry="28" fill="#a77d62"/><path d="M33 37q-5-34 20-34 30-3 25 31l-14-12-30 5z" fill="#3b3e38"/><path d="M18 278h33m20 0h34" stroke="#2d3b42" stroke-width="12"/></g><g transform="translate(994 388) scale(.4)"><path d="M10 100v120h25l12-80 10 80h25V100" fill="#495754"/><rect x="10" y="40" width="70" height="85" fill="#b19a59"/><circle cx="44" cy="20" r="24" fill="#c2b183"/></g><path d="M0 689l105-44 36 19-99 48z" fill="#d5b273"/><text x="30" y="735" font-family="Arial" font-size="13" fill="#e9e7d9">SITESIGHT FIXTURE · SYNTHETIC SITE ILLUSTRATION · VIEW ${variant ? "B / WEST" : "A / EAST"}</text></g></svg>`;
}
