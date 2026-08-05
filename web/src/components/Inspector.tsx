import React, { useState, useEffect } from 'react';
import { Dog, Parentage, ValidationWarning } from '../types';
import { Trash2, RotateCcw, Save, AlertTriangle, UserCheck, Heart } from 'lucide-react';

interface InspectorProps {
  selectedDog: Dog | null;
  allDogs: Dog[];
  relationships: Parentage[];
  warnings: ValidationWarning[];
  onUpdateDog: (dogId: string, patch: Partial<Dog>) => Promise<void>;
  onDeleteDog: (dogId: string, version: number) => Promise<void>;
  onRestoreDog: (dogId: string) => Promise<void>;
  onSaveRelationship: (rel: Partial<Parentage>) => Promise<void>;
  onDeleteRelationship: (relId: string) => Promise<void>;
}

export const Inspector: React.FC<InspectorProps> = ({
  selectedDog,
  allDogs,
  relationships,
  warnings,
  onUpdateDog,
  onDeleteDog,
  onRestoreDog,
  onSaveRelationship,
  onDeleteRelationship,
}) => {
  const [formData, setFormData] = useState<Partial<Dog>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedDog) {
      setFormData({
        name: selectedDog.name,
        registered_name: selectedDog.registered_name || '',
        sex: selectedDog.sex,
        breed: selectedDog.breed || '',
        birth_date: selectedDog.birth_date || '',
        death_date: selectedDog.death_date || '',
        registration_number: selectedDog.registration_number || '',
        microchip_number: selectedDog.microchip_number || '',
        color: selectedDog.color || '',
        notes: selectedDog.notes || '',
        version: selectedDog.version,
      });
      setIsDeleting(false);
      setErrorMsg(null);
    }
  }, [selectedDog]);

  if (!selectedDog) {
    return (
      <div className="sidebar-right" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          🐕 Select a dog from the list or pedigree graph to view and edit record details.
        </div>
      </div>
    );
  }

  const dogWarnings = warnings.filter(w => w.entity_id === selectedDog.id || relationships.some(r => r.id === w.entity_id && (r.child_id === selectedDog.id || r.parent_id === selectedDog.id)));
  const affectedRels = relationships.filter(r => r.child_id === selectedDog.id || r.parent_id === selectedDog.id);

  // Parents of selected dog
  const parentRels = relationships.filter(r => r.child_id === selectedDog.id);
  const sireRel = parentRels.find(r => r.role === 'SIRE');
  const damRel = parentRels.find(r => r.role === 'DAM');

  // Eligible male & female dogs for parents
  const availableSires = allDogs.filter(d => d.id !== selectedDog.id && !d.deleted_at && d.sex === 'M');
  const availableDams = allDogs.filter(d => d.id !== selectedDog.id && !d.deleted_at && d.sex === 'F');

  const handleFieldChange = (field: keyof Dog, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaving(true);
    try {
      await onUpdateDog(selectedDog.id, formData);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update dog');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignParent = async (role: 'SIRE' | 'DAM', parentId: string) => {
    if (!parentId) {
      const existingRel = role === 'SIRE' ? sireRel : damRel;
      if (existingRel) {
        await onDeleteRelationship(existingRel.id);
      }
      return;
    }
    setErrorMsg(null);
    try {
      const existingRel = role === 'SIRE' ? sireRel : damRel;
      if (existingRel) {
        await onSaveRelationship({
          id: existingRel.id,
          parent_id: parentId,
          role,
          relationship_type: 'BIOLOGICAL',
          confidence: 'CONFIRMED',
        });
      } else {
        await onSaveRelationship({
          child_id: selectedDog.id,
          parent_id: parentId,
          role,
          relationship_type: 'BIOLOGICAL',
          confidence: 'CONFIRMED',
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update parentage');
    }
  };

  return (
    <div className="sidebar-right">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Inspector</h3>
        {selectedDog.deleted_at ? (
          <button className="btn btn-sm btn-primary" onClick={() => onRestoreDog(selectedDog.id)}>
            <RotateCcw size={14} /> Restore
          </button>
        ) : (
          <button className="btn btn-sm btn-danger" onClick={() => setIsDeleting(!isDeleting)}>
            <Trash2 size={14} /> Soft Delete
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="warning-card" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: '#ef4444' }}>
          {errorMsg}
        </div>
      )}

      {isDeleting && (
        <div className="warning-card" style={{ background: 'rgba(239, 68, 68, 0.15)', borderColor: '#ef4444', color: '#f8fafc' }}>
          <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '0.35rem' }}>
            Confirm Soft Deletion
          </div>
          <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            Deleting <b>{selectedDog.name}</b> will affect {affectedRels.length} parentage relationships.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-sm btn-danger"
              onClick={async () => {
                try {
                  await onDeleteDog(selectedDog.id, selectedDog.version);
                  setIsDeleting(false);
                } catch (err: any) {
                  setErrorMsg(err.message);
                }
              }}
            >
              Confirm Delete
            </button>
            <button className="btn btn-sm" onClick={() => setIsDeleting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {dogWarnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <AlertTriangle size={14} /> Warnings ({dogWarnings.length})
          </div>
          {dogWarnings.map((w, i) => (
            <div key={i} className="warning-card">
              {w.message}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div className="form-group">
          <label>Dog Name</label>
          <input
            type="text"
            className="input-field"
            value={formData.name || ''}
            onChange={e => handleFieldChange('name', e.target.value)}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Sex</label>
            <select
              className="input-field"
              value={formData.sex || 'M'}
              onChange={e => handleFieldChange('sex', e.target.value as any)}
            >
              <option value="M">Male (M)</option>
              <option value="F">Female (F)</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </div>

          <div className="form-group">
            <label>Breed</label>
            <input
              type="text"
              className="input-field"
              value={formData.breed || ''}
              onChange={e => handleFieldChange('breed', e.target.value)}
            />
          </div>
        </div>

        {/* Parent assignments */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <UserCheck size={14} /> Assigned Parents
          </div>

          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
            <label>Sire (Father)</label>
            <select
              className="input-field"
              value={sireRel ? sireRel.parent_id : ''}
              onChange={e => handleAssignParent('SIRE', e.target.value)}
            >
              <option value="">-- No Sire Assigned --</option>
              {availableSires.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.registered_name ? `(${d.registered_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Dam (Mother)</label>
            <select
              className="input-field"
              value={damRel ? damRel.parent_id : ''}
              onChange={e => handleAssignParent('DAM', e.target.value)}
            >
              <option value="">-- No Dam Assigned --</option>
              {availableDams.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.registered_name ? `(${d.registered_name})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Registered Name</label>
          <input
            type="text"
            className="input-field"
            value={formData.registered_name || ''}
            onChange={e => handleFieldChange('registered_name', e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Reg Number</label>
            <input
              type="text"
              className="input-field"
              value={formData.registration_number || ''}
              onChange={e => handleFieldChange('registration_number', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Microchip Number</label>
            <input
              type="text"
              className="input-field"
              value={formData.microchip_number || ''}
              onChange={e => handleFieldChange('microchip_number', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Birth Date</label>
            <input
              type="date"
              className="input-field"
              value={formData.birth_date ? formData.birth_date.slice(0, 10) : ''}
              onChange={e => handleFieldChange('birth_date', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Death Date</label>
            <input
              type="date"
              className="input-field"
              value={formData.death_date ? formData.death_date.slice(0, 10) : ''}
              onChange={e => handleFieldChange('death_date', e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Color</label>
          <input
            type="text"
            className="input-field"
            value={formData.color || ''}
            onChange={e => handleFieldChange('color', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            className="input-field"
            rows={3}
            value={formData.notes || ''}
            onChange={e => handleFieldChange('notes', e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save Dog Details'}
        </button>
      </form>
    </div>
  );
};
