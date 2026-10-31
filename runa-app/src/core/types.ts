// Доменная модель Runa. Источник истины для всех представлений.

export type Id = string;
export type ISODate = string;

export const OBJECT_TYPES = ['area', 'folder', 'page', 'task'] as const;
export type BuiltinObjectType = (typeof OBJECT_TYPES)[number];

export interface SystemRec {
  id: Id;
  name: string;
  icon: string | null;
  cover?: string | null;
  content?: PlainContent | null;
  sortKey: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  archivedAt: ISODate | null;
}

export interface PlainContent {
  format: 'plain' | 'doc';
  text: string;
  doc?: unknown;
}

export interface Obj {
  id: Id;
  systemId: Id;
  type: string;
  title: string;
  parentId: Id | null;
  sortKey: string;
  /** Дополнительные типы объекта; основной — в поле type. */
  extraTypes?: string[];
  props: Record<string, unknown>;
  content: PlainContent | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  archivedAt: ISODate | null;
}

export interface Relationship {
  id: Id;
  systemId: Id;
  type: string;
  fromId: Id;
  toId: Id;
  props: Record<string, unknown>;
  createdAt: ISODate;
}

export const PROPERTY_KINDS = ['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url', 'relation'] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export interface SelectOption {
  id: Id;
  name: string;
  color: string;
}

export interface PropertyConfig {
  options?: SelectOption[];
  /** Для поля-связи: тип связи и (необязательно) допустимые типы целей. */
  relationType?: string;
  targetTypes?: string[] | null;
}

/** Пользовательский тип объекта: схема полей + оформление. */
export interface ObjectType {
  id: Id;
  systemId: Id;
  name: string;
  icon: string | null;
  color: string | null;
  sortKey: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Пользовательский тип связи. */
export interface RelationType {
  id: Id;
  systemId: Id;
  name: string;
  inverseName: string;
  directed: boolean;
  acyclic: boolean;
  color: string | null;
  sortKey: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface PropertyDef {
  id: Id;
  systemId: Id;
  name: string;
  kind: PropertyKind;
  config: PropertyConfig;
  appliesTo: string[] | null;
  sortKey: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export const VIEW_KINDS = ['table', 'kanban', 'canvas', 'graph'] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

export interface ViewConfig {
  depth?: 'children' | 'descendants';
  types?: string[] | null;
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
  groupBy?: Id | null;
  newType?: string;
  scope?: 'system' | 'host' | 'local';
  hops?: number;
  hierarchy?: boolean;
  isolated?: boolean;
  relTypes?: string[] | null;
}

export interface ViewRec {
  id: Id;
  systemId: Id;
  hostId: Id | null;
  kind: ViewKind;
  name: string;
  config: ViewConfig;
  sortKey: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ViewItem {
  id: Id;
  systemId: Id;
  viewId: Id;
  objectId: Id;
  layout: { order?: string; x?: number; y?: number; w?: number; h?: number };
}

export interface ViewElement {
  id: Id;
  systemId: Id;
  viewId: Id;
  kind: 'sticky' | 'frame';
  data: { x: number; y: number; w?: number; h?: number; text?: string; color?: string };
}

export interface TableMap {
  systems: SystemRec;
  objectTypes: ObjectType;
  relationTypes: RelationType;
  propertyDefs: PropertyDef;
  objects: Obj;
  views: ViewRec;
  viewItems: ViewItem;
  viewElements: ViewElement;
  relationships: Relationship;
}
export type Table = keyof TableMap;
export const TABLES: Table[] = ['systems', 'objectTypes', 'relationTypes', 'propertyDefs', 'objects', 'views', 'viewItems', 'viewElements', 'relationships'];
export const SYSTEM_TABLES = ['objectTypes', 'relationTypes', 'propertyDefs', 'objects', 'views', 'viewItems', 'viewElements', 'relationships'] as const;
export type SystemTable = (typeof SYSTEM_TABLES)[number];

export type DataState = { [T in Table]: Record<Id, TableMap[T]> };

export const emptyData = (): DataState => ({
  systems: {},
  objectTypes: {},
  relationTypes: {},
  propertyDefs: {},
  objects: {},
  views: {},
  viewItems: {},
  viewElements: {},
  relationships: {},
});

export type Op = {
  [T in Table]:
    | { kind: 'insert'; table: T; row: TableMap[T] }
    | { kind: 'update'; table: T; id: Id; patch: Partial<TableMap[T]>; prev: Partial<TableMap[T]> }
    | { kind: 'remove'; table: T; row: TableMap[T] };
}[Table];

export interface Transaction {
  id: Id;
  label: string;
  ops: Op[];
  at: number;
  mergeKey?: string;
}
