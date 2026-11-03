// @vitest-environment node
/**
 * 모바일 브리지의 v1 전용 import 경계를 AST로 검사합니다.
 * 주석·문자열 오탐 없이 alias·상대 경로·동적 import·재수출을 모두 검사합니다.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("페이지·Server Action·legacy·관리자 코드는 모바일 브리지를 import하지 않는다", () => {
  // Given
  const root = resolve(process.cwd(), "src");
  const bridge = resolve(root, "lib/api-v1-principal");
  const violations: string[] = [];
  // When
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    const path = resolve(entry.parentPath, entry.name);
    const name = relative(process.cwd(), path).replaceAll("\\", "/");
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require") ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier)) {
        const target = specifier.text.startsWith("@/") ? resolve(root, specifier.text.slice(2)) : resolve(dirname(path), specifier.text);
        if (target.replace(/\.[cm]?[jt]sx?$/, "") === bridge) {
          const allowed = name.startsWith("src/app/api/v1/") || name === "src/lib/academic-permissions.ts" ||
            name.startsWith("src/features/academics/") || name.startsWith("src/features/guidebooks/") || name.startsWith("src/features/users/me/");
          if (!allowed || name.includes("/actions/") || name.endsWith("/actions.ts")) violations.push(name);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  // Then
  expect(violations).toEqual([]);
});
