import { set_cptable } from "xlsx";
import * as codepages from "xlsx/dist/cpexcel";

// Preserve legacy .xls encodings as well as Unicode .xlsx workbooks.
set_cptable(codepages);

// Every untrusted workbook is read by the patched SheetJS CE parser.
export { read, utils, version } from "xlsx";
export type { CellObject, WorkBook, WorkSheet } from "xlsx";

// xlsx-js-style is used only to write our own workbooks, preserving their
// formatting. Never expose its old reader (SheetJS 0.18.5) to imported files.
export { write, writeFile } from "xlsx-js-style";
