import React from 'react';
import { Dog, Parentage } from '../types';
import { Search, Filter, AlertTriangle, Layers } from 'lucide-react';

interface DogListProps {
  dogs: Dog[];
  relationships: Parentage[];
  selectedDogId: string | null;
  onSelectDog: (dogId: string) => void;
  search: string;
  onSearchChange: (val: string) => void;
  filterIncomplete: boolean;
  onToggleIncomplete: () => void;
  filterStandalone: boolean;
  onToggleStandalone: () => void;
  showDeleted: boolean;
  onToggleShowDeleted: () => void;
  familyComponents: Map<string, Dog[]>;
  selectedFamilyId: string | null;
  onSelectFamily: (famId: string | null) => void;
}

export const DogList: React.FC<DogListProps> = ({
  dogs,
  relationships,
  selectedDogId,
  onSelectDog,
  search,
  onSearchChange,
  filterIncomplete,
  onToggleIncomplete,
  filterStandalone,
  onToggleStandalone,
  showDeleted,
  onToggleShowDeleted,
  familyComponents,
  selectedFamilyId,
  onSelectFamily,
}) => {
  // Compute parent count per dog
  const parentageByChild = new Map<string, { sire: boolean; dam: boolean }>();
  const dogInRels = new Set<string>();

  for (const rel of relationships) {
    dogInRels.add(rel.child_id);
    dogInRels.add(rel.parent_id);
    const item = parentageByChild.get(rel.child_id) || { sire: false, dam: false };
    if (rel.role === 'SIRE') item.sire = true;
    if (rel.role === 'DAM') item.dam = true;
    parentageByChild.set(rel.child_id, item);
  }

  const filteredDogs = dogs.filter(dog => {
    if (!showDeleted && dog.deleted_at) return false;
    if (filterStandalone && dogInRels.has(dog.id)) return false;
    if (filterIncomplete) {
      const p = parentageByChild.get(dog.id);
      if (p && p.sire && p.dam) return false;
    }
    if (search.trim()) {
      const term = search.toLowerCase().trim();
      const match =
        dog.name.toLowerCase().includes(term) ||
        dog.registered_name.toLowerCase().includes(term) ||
        dog.breed.toLowerCase().includes(term) ||
        dog.registration_number.toLowerCase().includes(term);
      if (!match) return false;
    }
    if (selectedFamilyId) {
      const famDogs = familyComponents.get(selectedFamilyId);
      if (!famDogs || !famDogs.some(fd => fd.id === dog.id)) return false;
    }
    return true;
  });

  return (
    <div className="sidebar-left">
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Search size={14} /> Search Dogs
        </label>
        <input
          type="text"
          className="input-field"
          placeholder="Name, Reg #, Breed..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        <button
          className={`btn btn-sm ${filterIncomplete ? 'btn-primary' : ''}`}
          onClick={onToggleIncomplete}
          title="Filter incomplete parentage"
        >
          <AlertTriangle size={12} /> Incomplete
        </button>
        <button
          className={`btn btn-sm ${filterStandalone ? 'btn-primary' : ''}`}
          onClick={onToggleStandalone}
          title="Filter standalone dogs"
        >
          <Filter size={12} /> Standalone
        </button>
        <button
          className={`btn btn-sm ${showDeleted ? 'btn-danger' : ''}`}
          onClick={onToggleShowDeleted}
          title="Toggle soft-deleted dogs"
        >
          Trash ({dogs.filter(d => d.deleted_at).length})
        </button>
      </div>

      {familyComponents.size > 1 && (
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Layers size={14} /> Families ({familyComponents.size})
          </label>
          <select
            className="input-field"
            value={selectedFamilyId || ''}
            onChange={e => onSelectFamily(e.target.value ? e.target.value : null)}
          >
            <option value="">All Families</option>
            {Array.from(familyComponents.entries()).map(([famId, famDogs]) => (
              <option key={famId} value={famId}>
                {famId} ({famDogs.length} dogs)
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span>Dogs ({filteredDogs.length})</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
        {filteredDogs.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
            No dogs found matching filters.
          </div>
        ) : (
          filteredDogs.map(dog => {
            const isSelected = dog.id === selectedDogId;
            return (
              <div
                key={dog.id}
                className={`dog-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectDog(dog.id)}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: dog.deleted_at ? '#ef4444' : undefined }}>
                    {dog.name} {dog.deleted_at && '(Deleted)'}
                  </div>
                  {dog.breed && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{dog.breed}</div>
                  )}
                </div>
                <span className={`sex-badge sex-${dog.sex}`}>{dog.sex}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
