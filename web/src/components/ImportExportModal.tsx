import React, { useState } from 'react';
import { ExportData } from '../types';
import { X, Upload, Download, FileText, CheckCircle, AlertOctagon } from 'lucide-react';

interface ImportExportModalProps {
  mode: 'export' | 'import' | null;
  onClose: () => void;
  exportData: ExportData | null;
  onImportSubmit: (data: ExportData) => Promise<void>;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  mode,
  onClose,
  exportData,
  onImportSubmit,
}) => {
  const [jsonText, setJsonText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!mode) return null;

  const handleDownloadJSON = () => {
    if (!exportData) return;
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedigree_export_${exportData.workspace.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      setJsonText(content);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!jsonText.trim()) {
      setErrorMsg('Please paste JSON data or select a valid file.');
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.schemaVersion !== 'dog-pedigree.v1') {
        setErrorMsg(`Invalid schemaVersion "${parsed.schemaVersion}". Expected "dog-pedigree.v1"`);
        return;
      }
      setIsSubmitting(true);
      await onImportSubmit(parsed);
      setSuccessMsg('Workspace imported successfully!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid JSON format or import error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === 'export' ? 'Export Workspace Data' : 'Import Workspace Data'}</h3>
          <button className="btn btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {errorMsg && (
          <div className="warning-card" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <AlertOctagon size={14} style={{ display: 'inline', marginRight: '0.35rem' }} />
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="warning-card" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderColor: '#22c55e' }}>
            <CheckCircle size={14} style={{ display: 'inline', marginRight: '0.35rem' }} />
            {successMsg}
          </div>
        )}

        {mode === 'export' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Export normalized pedigree records into portable versioned JSON (<code>dog-pedigree.v1</code>).
            </div>
            {exportData && (
              <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                <div><b>Workspace:</b> {exportData.workspace.name}</div>
                <div><b>Dogs:</b> {exportData.dogs.length}</div>
                <div><b>Relationships:</b> {exportData.relationships.length}</div>
              </div>
            )}
            <button className="btn btn-primary" onClick={handleDownloadJSON}>
              <Download size={16} /> Download JSON File
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Select JSON File</label>
              <input type="file" accept=".json" onChange={handleFileUpload} className="input-field" />
            </div>

            <div className="form-group">
              <label>Or Paste JSON Content</label>
              <textarea
                className="input-field"
                rows={6}
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                placeholder='{"schemaVersion": "dog-pedigree.v1", ...}'
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleImport} disabled={isSubmitting}>
                <Upload size={16} /> {isSubmitting ? 'Importing...' : 'Validate & Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
