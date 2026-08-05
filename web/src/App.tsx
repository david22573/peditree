import React, { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api/client';
import { Dog, Parentage, ExportData } from './types';
import { Header } from './components/Header';
import { DogList } from './components/DogList';
import { PedigreeGraph, PedigreeGraphRef } from './components/PedigreeGraph';
import { Inspector } from './components/Inspector';
import { AddDogModal } from './components/AddDogModal';
import { AddParentageModal } from './components/AddParentageModal';
import { ImportExportModal } from './components/ImportExportModal';
import { calculateConnectedComponents, filterGraph } from './graph/algorithms';

export const App: React.FC = () => {
  const queryClient = useQueryClient();
  const graphRef = useRef<PedigreeGraphRef>(null);

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [filterStandalone, setFilterStandalone] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<'all' | 'ancestors' | 'descendants'>('all');

  // Modals
  const [isAddDogOpen, setIsAddDogOpen] = useState(false);
  const [isAddParentageOpen, setIsAddParentageOpen] = useState(false);
  const [importExportMode, setImportExportMode] = useState<'export' | 'import' | null>(null);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);

  // Fetch Workspaces
  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.listWorkspaces,
  });

  // Default select first workspace
  const activeWsId = currentWorkspaceId || (workspaces.length > 0 ? workspaces[0].id : '');

  // Fetch Workspace Snapshot
  const { data: snapshot, isLoading: isLoadingSnapshot, error: snapshotError } = useQuery({
    queryKey: ['snapshot', activeWsId],
    queryFn: () => api.getSnapshot(activeWsId),
    enabled: !!activeWsId,
  });

  const dogs = snapshot?.dogs || [];
  const relationships = snapshot?.relationships || [];
  const warnings = snapshot?.warnings || [];

  // Compute family components
  const familyComponents = useMemo(() => {
    return calculateConnectedComponents(dogs, relationships);
  }, [dogs, relationships]);

  const selectedFamilyDogs = useMemo(() => {
    if (!selectedFamilyId) return undefined;
    const list = familyComponents.get(selectedFamilyId);
    return list ? new Set(list.map(d => d.id)) : undefined;
  }, [selectedFamilyId, familyComponents]);

  // Filtered dogs & relationships for graph
  const { filteredDogs, filteredRelationships } = useMemo(() => {
    return filterGraph(dogs, relationships, {
      search,
      showDeleted,
      incompleteOnly: filterIncomplete,
      familyDogs: selectedFamilyDogs,
      selectedDogId: selectedDogId || undefined,
      focusMode,
    });
  }, [dogs, relationships, search, showDeleted, filterIncomplete, selectedFamilyDogs, selectedDogId, focusMode]);

  const selectedDog = useMemo(() => {
    return dogs.find(d => d.id === selectedDogId) || null;
  }, [dogs, selectedDogId]);

  // Mutations
  const invalidateSnapshot = () => {
    queryClient.invalidateQueries({ queryKey: ['snapshot', activeWsId] });
  };

  const createWorkspaceMutation = useMutation({
    mutationFn: (name: string) => api.createWorkspace(name),
    onSuccess: ws => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setCurrentWorkspaceId(ws.id);
    },
  });

  const createDogMutation = useMutation({
    mutationFn: (dog: Partial<Dog>) => api.createDog(activeWsId, dog),
    onSuccess: newDog => {
      invalidateSnapshot();
      setSelectedDogId(newDog.id);
    },
  });

  const updateDogMutation = useMutation({
    mutationFn: ({ dogId, patch }: { dogId: string; patch: Partial<Dog> }) => api.updateDog(dogId, patch),
    onSuccess: () => invalidateSnapshot(),
  });

  const deleteDogMutation = useMutation({
    mutationFn: ({ dogId, version }: { dogId: string; version: number }) => api.deleteDog(dogId, version),
    onSuccess: () => {
      invalidateSnapshot();
      setSelectedDogId(null);
    },
  });

  const restoreDogMutation = useMutation({
    mutationFn: (dogId: string) => api.restoreDog(dogId),
    onSuccess: () => invalidateSnapshot(),
  });

  const createParentageMutation = useMutation({
    mutationFn: (p: Partial<Parentage>) => api.createParentage(activeWsId, p),
    onSuccess: () => invalidateSnapshot(),
  });

  const updateParentageMutation = useMutation({
    mutationFn: (p: Partial<Parentage>) => api.updateParentage(p.id!, p),
    onSuccess: () => invalidateSnapshot(),
  });

  const deleteParentageMutation = useMutation({
    mutationFn: (relId: string) => api.deleteParentage(relId),
    onSuccess: () => invalidateSnapshot(),
  });

  const handleExport = async () => {
    if (!activeWsId) return;
    const data = await api.exportWorkspace(activeWsId);
    setExportData(data);
    setImportExportMode('export');
  };

  const handleBackup = async () => {
    if (!activeWsId) return;
    try {
      const res = await api.backupDatabase(activeWsId);
      setBackupNotice(`Backup created safely at ${res.backup_path}`);
      setTimeout(() => setBackupNotice(null), 5000);
    } catch (err: any) {
      alert(`Backup failed: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header
        workspaces={workspaces}
        currentWorkspaceId={activeWsId}
        onSelectWorkspace={id => {
          setCurrentWorkspaceId(id);
          setSelectedDogId(null);
        }}
        onCreateWorkspace={() => {
          const name = prompt('Enter new workspace name:');
          if (name) createWorkspaceMutation.mutate(name);
        }}
        onAddDog={() => setIsAddDogOpen(true)}
        onAddParentage={() => setIsAddParentageOpen(true)}
        onFitGraph={() => graphRef.current?.fit()}
        onExport={handleExport}
        onImport={() => setImportExportMode('import')}
        onBackup={handleBackup}
        focusMode={focusMode}
        onChangeFocusMode={setFocusMode}
      />

      {backupNotice && (
        <div style={{ background: '#22c55e', color: '#ffffff', padding: '0.5rem 1rem', fontSize: '0.85rem', textAlign: 'center' }}>
          {backupNotice}
        </div>
      )}

      {snapshotError && (
        <div style={{ background: '#ef4444', color: '#ffffff', padding: '0.5rem 1rem', fontSize: '0.85rem', textAlign: 'center' }}>
          Error loading snapshot: {(snapshotError as any).message}
        </div>
      )}

      <div className="main-layout">
        <DogList
          dogs={dogs}
          relationships={relationships}
          selectedDogId={selectedDogId}
          onSelectDog={id => setSelectedDogId(id)}
          search={search}
          onSearchChange={setSearch}
          filterIncomplete={filterIncomplete}
          onToggleIncomplete={() => setFilterIncomplete(!filterIncomplete)}
          filterStandalone={filterStandalone}
          onToggleStandalone={() => setFilterStandalone(!filterStandalone)}
          showDeleted={showDeleted}
          onToggleShowDeleted={() => setShowDeleted(!showDeleted)}
          familyComponents={familyComponents}
          selectedFamilyId={selectedFamilyId}
          onSelectFamily={setSelectedFamilyId}
        />

        <PedigreeGraph
          ref={graphRef}
          dogs={filteredDogs}
          relationships={filteredRelationships}
          selectedDogId={selectedDogId}
          onSelectDog={id => setSelectedDogId(id)}
        />

        <Inspector
          selectedDog={selectedDog}
          allDogs={dogs}
          relationships={relationships}
          warnings={warnings}
          onUpdateDog={async (dogId, patch) => {
            await updateDogMutation.mutateAsync({ dogId, patch });
          }}
          onDeleteDog={async (dogId, version) => {
            await deleteDogMutation.mutateAsync({ dogId, version });
          }}
          onRestoreDog={async dogId => {
            await restoreDogMutation.mutateAsync(dogId);
          }}
          onSaveRelationship={async p => {
            if (p.id) {
              await updateParentageMutation.mutateAsync(p);
            } else {
              await createParentageMutation.mutateAsync(p);
            }
          }}
          onDeleteRelationship={async relId => {
            await deleteParentageMutation.mutateAsync(relId);
          }}
        />
      </div>

      <AddDogModal
        isOpen={isAddDogOpen}
        onClose={() => setIsAddDogOpen(false)}
        onSubmit={async dogData => {
          await createDogMutation.mutateAsync(dogData);
        }}
      />

      <AddParentageModal
        isOpen={isAddParentageOpen}
        onClose={() => setIsAddParentageOpen(false)}
        dogs={dogs}
        selectedChildId={selectedDogId}
        onSubmit={async relData => {
          await createParentageMutation.mutateAsync(relData);
        }}
      />

      <ImportExportModal
        mode={importExportMode}
        onClose={() => setImportExportMode(null)}
        exportData={exportData}
        onImportSubmit={async importedData => {
          await api.importWorkspace(activeWsId, importedData);
          invalidateSnapshot();
        }}
      />
    </div>
  );
};
