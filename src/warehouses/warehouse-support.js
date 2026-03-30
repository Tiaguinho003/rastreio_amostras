import { HttpError } from '../contracts/errors.js';
import {
  assertAuthenticatedActor,
  buildAuditContext,
  buildDiff,
  normalizeOptionalText,
  normalizeRequiredText,
  readLimitQuery,
  readPageQuery,
  toIsoString
} from '../users/user-support.js';

export const WAREHOUSE_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE'
};

export const WAREHOUSE_AUDIT_EVENT_TYPES = {
  WAREHOUSE_CREATED: 'WAREHOUSE_CREATED',
  WAREHOUSE_UPDATED: 'WAREHOUSE_UPDATED',
  WAREHOUSE_INACTIVATED: 'WAREHOUSE_INACTIVATED',
  WAREHOUSE_REACTIVATED: 'WAREHOUSE_REACTIVATED'
};

export const WAREHOUSE_LIST_LIMIT_DEFAULT = 10;
export const WAREHOUSE_LIST_LIMIT_MAX = 30;
export const WAREHOUSE_AUDIT_LIMIT_DEFAULT = 10;
export const WAREHOUSE_AUDIT_LIMIT_MAX = 20;
export const WAREHOUSE_LOOKUP_LIMIT = 10;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function canonicalizeWarehouseName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeWarehouseStatus(value, fieldName = 'status') {
  const text = String(value ?? '').trim().toUpperCase();
  if (text !== WAREHOUSE_STATUSES.ACTIVE && text !== WAREHOUSE_STATUSES.INACTIVE) {
    throw new HttpError(422, `${fieldName} must be ACTIVE or INACTIVE`, {
      code: 'INVALID_WAREHOUSE_STATUS',
      field: fieldName
    });
  }
  return text;
}

function normalizeWarehouseName(value, fieldName = 'name') {
  const text = normalizeRequiredText(value, fieldName);
  if (text.length > 200) {
    throw new HttpError(422, `${fieldName} must be at most 200 characters`, {
      code: 'WAREHOUSE_NAME_TOO_LONG',
      field: fieldName
    });
  }
  return text;
}

function normalizeWarehouseAddress(value, fieldName = 'address') {
  return normalizeOptionalText(value, fieldName, 500);
}

function normalizeWarehousePhone(value, fieldName = 'phone') {
  return normalizeOptionalText(value, fieldName, 30);
}

function normalizeOptionalSearch(value, fieldName = 'search', maxLength = 200) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  if (text.length === 0) {
    return null;
  }

  if (text.length > maxLength) {
    throw new HttpError(422, `${fieldName} must be at most ${maxLength} characters`, {
      code: 'SEARCH_TOO_LONG',
      field: fieldName
    });
  }

  return text;
}

function normalizeReasonText(value, fieldName = 'reasonText') {
  const text = normalizeRequiredText(value, fieldName);
  if (text.length > 300) {
    throw new HttpError(422, `${fieldName} must be at most 300 characters`, {
      code: 'REASON_TEXT_TOO_LONG',
      field: fieldName
    });
  }
  return text;
}

export function normalizeCreateWarehouseInput(input) {
  const name = normalizeWarehouseName(input.name);
  const nameCanonical = canonicalizeWarehouseName(name);
  if (nameCanonical.length === 0) {
    throw new HttpError(422, 'name must not be empty after normalization', {
      code: 'WAREHOUSE_NAME_EMPTY',
      field: 'name'
    });
  }

  return {
    name,
    nameCanonical,
    address: normalizeWarehouseAddress(input.address),
    phone: normalizeWarehousePhone(input.phone)
  };
}

export function normalizeUpdateWarehouseInput(input, currentWarehouse) {
  const data = {};

  if (hasOwn(input, 'name')) {
    data.name = normalizeWarehouseName(input.name);
    data.nameCanonical = canonicalizeWarehouseName(data.name);
    if (data.nameCanonical.length === 0) {
      throw new HttpError(422, 'name must not be empty after normalization', {
        code: 'WAREHOUSE_NAME_EMPTY',
        field: 'name'
      });
    }
  } else {
    data.name = currentWarehouse.name;
    data.nameCanonical = currentWarehouse.nameCanonical;
  }

  if (hasOwn(input, 'address')) {
    data.address = normalizeWarehouseAddress(input.address);
  } else {
    data.address = currentWarehouse.address;
  }

  if (hasOwn(input, 'phone')) {
    data.phone = normalizeWarehousePhone(input.phone);
  } else {
    data.phone = currentWarehouse.phone;
  }

  const reasonText = hasOwn(input, 'reasonText') && input.reasonText !== null && input.reasonText !== undefined
    ? normalizeReasonText(input.reasonText)
    : null;

  return { data, reasonText };
}

export function normalizeListWarehousesInput(input) {
  return {
    page: readPageQuery(input.page, 1),
    limit: readLimitQuery(input.limit, { fallback: WAREHOUSE_LIST_LIMIT_DEFAULT, max: WAREHOUSE_LIST_LIMIT_MAX }),
    search: normalizeOptionalSearch(input.search),
    status: input.status ? normalizeWarehouseStatus(input.status) : null
  };
}

export function normalizeLookupWarehousesInput(input) {
  const search = normalizeOptionalSearch(input.search);
  if (!search || search.length < 2) {
    throw new HttpError(422, 'search must be at least 2 characters', {
      code: 'SEARCH_TOO_SHORT',
      field: 'search'
    });
  }

  return {
    search,
    limit: WAREHOUSE_LOOKUP_LIMIT
  };
}

export function normalizeAuditListInput(input) {
  return {
    page: readPageQuery(input.page, 1),
    limit: readLimitQuery(input.limit, { fallback: WAREHOUSE_AUDIT_LIMIT_DEFAULT, max: WAREHOUSE_AUDIT_LIMIT_MAX })
  };
}

export function normalizeStatusReasonInput(input) {
  return {
    reasonText: normalizeReasonText(input.reasonText)
  };
}

export function toWarehouseSummary(warehouse) {
  return {
    id: warehouse.id,
    name: warehouse.name,
    address: warehouse.address ?? null,
    phone: warehouse.phone ?? null,
    status: warehouse.status,
    sampleCount: warehouse._count?.samples ?? null,
    createdAt: toIsoString(warehouse.createdAt),
    updatedAt: toIsoString(warehouse.updatedAt)
  };
}

export function toWarehouseAuditEventResponse(event) {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    payload: event.payload ?? {},
    reasonText: event.reasonText ?? null,
    createdAt: toIsoString(event.createdAt),
    actorUser: event.actorUser
      ? {
          id: event.actorUser.id,
          fullName: event.actorUser.fullName,
          username: event.actorUser.username
        }
      : null,
    targetWarehouse: event.targetWarehouse
      ? {
          id: event.targetWarehouse.id,
          name: event.targetWarehouse.name,
          status: event.targetWarehouse.status
        }
      : null,
    metadata: {
      ip: event.metadataIp ?? null,
      userAgent: event.metadataUserAgent ?? null
    }
  };
}

export function buildWarehouseAuditState(warehouse) {
  return {
    name: warehouse.name ?? null,
    address: warehouse.address ?? null,
    phone: warehouse.phone ?? null,
    status: warehouse.status ?? null
  };
}

export function buildWarehouseAuditPayload(before, after) {
  const diff = buildDiff(before, after);
  return {
    before,
    after,
    diff
  };
}

export function buildWarehouseListPage(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    limit,
    page,
    offset: (page - 1) * limit,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages
  };
}

export { assertAuthenticatedActor, buildAuditContext };
