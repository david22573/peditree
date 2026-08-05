import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dog, Sex } from '../types';
import { X } from 'lucide-react';

const dogSchema = z.object({
  name: z.string().min(1, 'Dog name is required'),
  registered_name: z.string().optional(),
  sex: z.enum(['M', 'F', 'UNKNOWN'] as const),
  breed: z.string().optional(),
  birth_date: z.string().optional(),
  registration_number: z.string().optional(),
  microchip_number: z.string().optional(),
  color: z.string().optional(),
  notes: z.string().optional(),
});

type DogFormData = z.infer<typeof dogSchema>;

interface AddDogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Dog>) => Promise<void>;
}

export const AddDogModal: React.FC<AddDogModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DogFormData>({
    resolver: zodResolver(dogSchema),
    defaultValues: {
      name: '',
      registered_name: '',
      sex: 'M',
      breed: '',
      birth_date: '',
      registration_number: '',
      microchip_number: '',
      color: '',
      notes: '',
    },
  });

  if (!isOpen) return null;

  const onFormSubmit = async (data: DogFormData) => {
    await onSubmit({
      ...data,
      birth_date: data.birth_date ? data.birth_date : null,
    });
    reset();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add New Dog</h3>
          <button className="btn btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="form-group">
            <label>Dog Name *</label>
            <input className="input-field" {...register('name')} placeholder="e.g. Max" />
            {errors.name && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{errors.name.message}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Sex</label>
              <select className="input-field" {...register('sex')}>
                <option value="M">Male (M)</option>
                <option value="F">Female (F)</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>

            <div className="form-group">
              <label>Breed</label>
              <input className="input-field" {...register('breed')} placeholder="e.g. Golden Retriever" />
            </div>
          </div>

          <div className="form-group">
            <label>Registered Name</label>
            <input className="input-field" {...register('registered_name')} placeholder="Official pedigree name" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Reg Number</label>
              <input className="input-field" {...register('registration_number')} />
            </div>

            <div className="form-group">
              <label>Microchip</label>
              <input className="input-field" {...register('microchip_number')} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Birth Date</label>
              <input type="date" className="input-field" {...register('birth_date')} />
            </div>

            <div className="form-group">
              <label>Color</label>
              <input className="input-field" {...register('color')} />
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea className="input-field" rows={2} {...register('notes')} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Dog'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
