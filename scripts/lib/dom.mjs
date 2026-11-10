// Small jsdom helpers shared by the migration and check scripts.
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><body></body>");
export const document = window.document;

export function fragment(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content;
}

/** Order-insensitive canonical form of an HTML string, for round-trip comparison. */
export function canon(html) {
  return [...fragment(html).childNodes].map(nodeCanon).join("");
}

function nodeCanon(n) {
  if (n.nodeType === 3) return n.data.replace(/\s+/g, " ");
  if (n.nodeType !== 1) return "";
  const a = [...n.attributes]
    .map((x) => [x.name, x.name === "class" ? x.value.trim().split(/\s+/).sort().join(" ") : x.value.trim().replace(/;$/, "").replace(/\s*:\s*/g, ":")])
    .filter(([k, v]) => !(k === "class" && v === ""))
    .sort((p, q) => (p[0] < q[0] ? -1 : 1))
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const kids = n.tagName === "TEMPLATE" ? [...n.content.childNodes] : [...n.childNodes];
  return `<${n.tagName.toLowerCase()}${a ? " " + a : ""}>${kids.map(nodeCanon).join("")}</${n.tagName.toLowerCase()}>`;
}
