import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dog, Parentage, Role, RelationshipType, Confidence } from '../types';
import { X } from 'lucide-react';

const parentageSchema = z.object({
  child_id: z.string().min(1, 'Child dog is required'),
  parent_id: z.string().min(1, 'Parent dog is required'),
  role: z.enum(['SIRE', 'DAM', 'PARENT'] as const),
  relationship_type: z.enum(['BIOLOGICAL', 'ADOPTIVE', 'FOSTER', 'UNKNOWN'] as const),
  confidence: z.enum(['CONFIRMED', 'PROBABLE', 'POSSIBLE'] as const),
  source_note: z.string().optional(),
});

type ParentageFormData = z.infer<typeof parentageSchema>;

interface AddParentageModalProps {
  isOpen: boolean;
  onClose: () => void;
  dogs: Dog[];
  selectedChildId?: string | null;
  onSubmit: (data: Partial<Parentage>) => Promise<void>;
}

export const AddParentageModal: React.FC<AddParentageModalProps> = ({
  isOpen,
  onClose,
  dogs,
  selectedChildId,
  onSubmit,
}) => {
  const activeDogs = dogs.filter(d => !d.deleted_at);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ParentageFormData>({
    resolver: zodResolver(parentageSchema),
    defaultValues: {
      child_id: selectedChildId || '',
      parent_id: '',
      role: 'SIRE',
      relationship_type: 'BIOLOGICAL',
      confidence: 'CONFIRMED',
      source_note: '',
    },
  });

  if (!isOpen) return null;

  const selectedChild = watch('child_id');
  const availableParents = activeDogs.filter(d => d.id !== selectedChild);

  const onFormSubmit = async (data: ParentageFormData) => {
    if (data.child_id === data.parent_id) {
      setError('parent_id', { message: 'A dog cannot be its own parent' });
      return;
    }
    try {
      await onSubmit(data);
      reset();
      onClose();
    } catch (err: any) {
      setError('root', { message: err.message || 'Failed to create relationship' });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Parent Relationship</h3>
          <button className="btn btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {errors.root && (
          <div className="warning-card" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            {errors.root.message}
          </div>
        )}

        <form onSubmit={handleSubmit(onFormSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="form-group">
            <label>Child Dog *</label>
            <select className="input-field" {...register('child_id')}>
              <option value="">-- Select Child Dog --</option>
              {activeDogs.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.sex})
                </option>
              ))}
            </select>
            {errors.child_id && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{errors.child_id.message}</span>}
          </div>

          <div className="form-group">
            <label>Parent Dog *</label>
            <select className="input-field" {...register('parent_id')}>
              <option value="">-- Select Parent Dog --</option>
              {availableParents.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.sex})
                </option>
              ))}
            </select>
            {errors.parent_id && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{errors.parent_id.message}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Role</label>
              <select className="input-field" {...register('role')}>
                <option value="SIRE">Sire (Father)</option>
                <option value="DAM">Dam (Mother)</option>
                <option value="PARENT">Other Parent</option>
              </select>
            </div>

            <div className="form-group">
              <label>Relationship Type</label>
              <select className="input-field" {...register('relationship_type')}>
                <option value="BIOLOGICAL">Biological</option>
                <option value="ADOPTIVE">Adoptive</option>
                <option value="FOSTER">Foster</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Confidence</label>
            <select className="input-field" {...register('confidence')}>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PROBABLE">Probable</option>
              <option value="POSSIBLE">Possible</option>
            </select>
          </div>

          <div className="form-group">
            <label>Source Notes / Reference</label>
            <input className="input-field" {...register('source_note')} placeholder="e.g. AKC Certificate #1234" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Add Relationship'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
