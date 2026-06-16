import { MachinaLayoutError } from "./errors";
import type { LayoutRow, LayoutRowVariant, LayoutVariantCondition, Rect } from "./types";
import { assertFiniteNumber, assertNonNegativeSize } from "./validation";

function validateRootRect(rootRect: Rect): void {
  assertFiniteNumber(rootRect.x, "rootRect.x");
  assertFiniteNumber(rootRect.y, "rootRect.y");
  assertNonNegativeSize(rootRect.width, "rootRect.width");
  assertNonNegativeSize(rootRect.height, "rootRect.height");
}

function validateCondition(
  condition: LayoutVariantCondition,
  rowIndex: number,
  variantIndex: number,
): void {
  if (condition.minWidth !== undefined) {
    assertFiniteNumber(
      condition.minWidth,
      `rows[${rowIndex}].variants[${variantIndex}].when.minWidth`,
    );
  }
  if (condition.maxWidth !== undefined) {
    assertFiniteNumber(
      condition.maxWidth,
      `rows[${rowIndex}].variants[${variantIndex}].when.maxWidth`,
    );
  }
  if (condition.minHeight !== undefined) {
    assertFiniteNumber(
      condition.minHeight,
      `rows[${rowIndex}].variants[${variantIndex}].when.minHeight`,
    );
  }
  if (condition.maxHeight !== undefined) {
    assertFiniteNumber(
      condition.maxHeight,
      `rows[${rowIndex}].variants[${variantIndex}].when.maxHeight`,
    );
  }

  if (
    condition.minWidth !== undefined &&
    condition.maxWidth !== undefined &&
    condition.minWidth > condition.maxWidth
  ) {
    throw new MachinaLayoutError(
      "InvalidVariantCondition",
      `rows[${rowIndex}].variants[${variantIndex}].when has minWidth > maxWidth`,
    );
  }

  if (
    condition.minHeight !== undefined &&
    condition.maxHeight !== undefined &&
    condition.minHeight > condition.maxHeight
  ) {
    throw new MachinaLayoutError(
      "InvalidVariantCondition",
      `rows[${rowIndex}].variants[${variantIndex}].when has minHeight > maxHeight`,
    );
  }
}

function conditionMatches(condition: LayoutVariantCondition, rootRect: Rect): boolean {
  if (condition.minWidth !== undefined && rootRect.width < condition.minWidth) return false;
  if (condition.maxWidth !== undefined && rootRect.width > condition.maxWidth) return false;
  if (condition.minHeight !== undefined && rootRect.height < condition.minHeight) return false;
  if (condition.maxHeight !== undefined && rootRect.height > condition.maxHeight) return false;
  return true;
}

function validateVariantZ(variant: LayoutRowVariant, rowIndex: number, variantIndex: number): void {
  if (variant.z === undefined) return;
  assertFiniteNumber(variant.z, `rows[${rowIndex}].variants[${variantIndex}].z`);
  if (!Number.isInteger(variant.z) || variant.z < -5 || variant.z > 5) {
    throw new MachinaLayoutError(
      "InvalidZ",
      `rows[${rowIndex}].variants[${variantIndex}].z must be an integer in range -5..5`,
    );
  }
}

export function selectLayoutRowsForRoot(rows: LayoutRow[], rootRect: Rect): LayoutRow[] {
  validateRootRect(rootRect);

  return rows.map((row, rowIndex) => {
    const baseRow: LayoutRow = { ...row };
    delete (baseRow as LayoutRow & { variants?: LayoutRowVariant[] }).variants;

    const variants = row.variants;
    if (!variants || variants.length === 0) {
      return baseRow;
    }

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
      const variant = variants[variantIndex];
      validateCondition(variant.when, rowIndex, variantIndex);
      validateVariantZ(variant, rowIndex, variantIndex);

      if (!conditionMatches(variant.when, rootRect)) {
        continue;
      }

      const selected: LayoutRow = {
        ...baseRow,
        frame: variant.frame ?? baseRow.frame,
        arrange: variant.arrange ?? baseRow.arrange,
        offset: variant.offset ?? baseRow.offset,
        z: variant.z ?? baseRow.z,
        view: variant.view ?? baseRow.view,
        slot: variant.slot ?? baseRow.slot,
        debugLabel: variant.debugLabel ?? baseRow.debugLabel,
        layer: variant.layer ?? baseRow.layer,
      };
      return selected;
    }

    return baseRow;
  });
}
