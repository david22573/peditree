import React from 'react';
import { Workspace } from '../types';
import { Plus, UserPlus, Maximize2, Download, Upload, Database, Eye } from 'lucide-react';

interface HeaderProps {
  workspaces: Workspace[];
  currentWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  onAddDog: () => void;
  onAddParentage: () => void;
  onFitGraph: () => void;
  onExport: () => void;
  onImport: () => void;
  onBackup: () => void;
  focusMode: 'all' | 'ancestors' | 'descendants';
  onChangeFocusMode: (mode: 'all' | 'ancestors' | 'descendants') => void;
}

export const Header: React.FC<HeaderProps> = ({
  workspaces,
  currentWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onAddDog,
  onAddParentage,
  onFitGraph,
  onExport,
  onImport,
  onBackup,
  focusMode,
  onChangeFocusMode,
}) => {
  return (
    <header className="app-header">
      <div className="brand">
        🐕 Peditree
        <select
          className="input-field"
          style={{ width: 'auto', minWidth: '160px', marginLeft: '1rem' }}
          value={currentWorkspaceId}
          onChange={e => {
            if (e.target.value === '__NEW__') {
              onCreateWorkspace();
            } else {
              onSelectWorkspace(e.target.value);
            }
          }}
        >
          {workspaces.map(ws => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
          <option value="__NEW__">+ New Workspace...</option>
        </select>
      </div>

      <div className="header-actions">
        <button className="btn btn-primary" onClick={onAddDog}>
          <Plus size={16} /> Add Dog
        </button>

        <button className="btn" onClick={onAddParentage}>
          <UserPlus size={16} /> Add Parent
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-card)', padding: '0.25rem', borderRadius: '6px' }}>
          <Eye size={14} style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }} />
          <select
            className="input-field"
            style={{ width: 'auto', border: 'none', background: 'transparent', padding: '0.25rem' }}
            value={focusMode}
            onChange={e => onChangeFocusMode(e.target.value as any)}
          >
            <option value="all">Full Graph</option>
            <option value="ancestors">Ancestors Only</option>
            <option value="descendants">Descendants Only</option>
          </select>
        </div>

        <button className="btn" onClick={onFitGraph} title="Fit Graph to View">
          <Maximize2 size={16} /> Fit View
        </button>

        <button className="btn" onClick={onExport} title="Export JSON">
          <Download size={16} /> Export
        </button>

        <button className="btn" onClick={onImport} title="Import JSON">
          <Upload size={16} /> Import
        </button>

        <button className="btn" onClick={onBackup} title="Backup Database">
          <Database size={16} /> Backup
        </button>
      </div>
    </header>
  );
};
