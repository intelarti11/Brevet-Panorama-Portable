import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useBrevetBlancReport } from "./use-brevet-blanc-report";

test("le graphique BB conserve zéro et distingue une note non renseignée", () => {
  for (const year of ["2025", "2026"]) {
    const students = [{ id: "1", NOM: "TEST", PRENOM: "Ada", CLASSE: "3e 1", notes: {
      Français: { bb1: 0, bb2: 0 }, Mathématiques: { bb1: 10 },
    } }];
    let report: ReturnType<typeof useBrevetBlancReport>["reportData"] = null;
    function Probe() {
      report = useBrevetBlancReport({ classNames: ["3e 1"], brevetType: "comparison" }, students, year).reportData;
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    // The assignment runs during rendering, outside TypeScript's control flow.
    const result = report as ReturnType<typeof useBrevetBlancReport>["reportData"];
    assert.ok(result);
    const french = result.comparisonChartData.find((subject) => subject.name === "Français");
    const maths = result.comparisonChartData.find((subject) => subject.name === "Mathématiques");
    const missing = result.comparisonChartData.find((subject) => subject.name === "Technologie");
    assert.deepEqual(french, { name: "Français", bb1: 0, bb2: 0 });
    assert.equal(maths?.bb1, year === "2026" ? 10 : 2);
    assert.equal(maths?.bb2, undefined);
    assert.equal(missing?.bb1, undefined);
    assert.equal(missing?.bb2, undefined);
  }
});
