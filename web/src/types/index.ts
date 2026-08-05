export type Sex = 'M' | 'F' | 'UNKNOWN';
export type Role = 'SIRE' | 'DAM' | 'PARENT';
export type RelationshipType = 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER' | 'UNKNOWN';
export type Confidence = 'CONFIRMED' | 'PROBABLE' | 'POSSIBLE';

export interface Dog {
  id: string;
  workspace_id: string;
  name: string;
  registered_name: string;
  sex: Sex;
  breed: string;
  birth_date: string | null;
  death_date: string | null;
  registration_number: string;
  microchip_number: string;
  color: string;
  notes: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Parentage {
  id: string;
  workspace_id: string;
  child_id: string;
  parent_id: string;
  role: Role;
  relationship_type: RelationshipType;
  confidence: Confidence;
  source_note: string;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  entity_id: string;
  entity_type: 'DOG' | 'PARENTAGE';
}

export interface WorkspaceSnapshot {
  workspace: Workspace;
  revision: number;
  dogs: Dog[];
  relationships: Parentage[];
  warnings: ValidationWarning[];
}

export interface ExportData {
  schemaVersion: string;
  exportedAt: string;
  workspace: Workspace;
  dogs: Dog[];
  relationships: Parentage[];
}

export interface VisNode {
  id: string;
  label: string;
  shape?: string;
  color?: {
    background: string;
    border: string;
    highlight?: { background: string; border: string };
  };
  font?: { color: string; size?: number; multi?: boolean };
  level?: number;
  title?: string;
  isUnionNode?: boolean;
  dogId?: string;
  borderWidth?: number;
  shapeProperties?: { borderDashes?: boolean | number[] };
}

export interface VisEdge {
  id: string;
  from: string;
  to: string;
  dashes?: boolean | number[];
  color?: { color: string; highlight?: string };
  arrows?: string | { to?: { enabled?: boolean } };
  label?: string;
  title?: string;
  width?: number;
}
