import React from 'react';
import { DndContext } from '@dnd-kit/core';
import ColumnHeader from '../common/ColumnHeader';
import TextLane from './TextLane';
import EmotionLane from './EmotionLane';

const noop = () => {};

export default function JourneyMapView({
  lanes = [],
  gridColumns = [],
  cells = {},
  emotionValues = {},
  globalMetrics = [],
  globalJourneys = [],
  onOpenLinkedJourneyPreview,
  isExport = false,
}) {
  return (
    <DndContext onDragStart={noop} onDragOver={noop} onDragEnd={noop} onDragCancel={noop}>
    <div className="inline-flex flex-col w-max min-h-0 bg-white">
      {/* Column headers row */}
      <div className="flex bg-white h-12 items-end pb-2 border-b border-gray-100">
        <div className="w-64 shrink-0 sticky left-0 z-[110] bg-white border-r border-gray-100 h-full shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]" />
        <div className="flex">
          {gridColumns.map((col, i) => (
            <ColumnHeader
              key={col.id}
              index={i}
              isLast={i === gridColumns.length - 1}
              onAddRight={noop}
              onMoveLeft={noop}
              onMoveRight={noop}
              onDelete={noop}
              isMenuOpen={false}
              onToggleMenu={noop}
              readOnly
            />
          ))}
        </div>
      </div>

      {/* Lanes */}
      <div className="flex flex-col">
        {lanes.map((lane) =>
          lane.type === 'emotion' ? (
            <EmotionLane
              key={lane.id}
              lane={lane}
              gridColumns={gridColumns}
              laneData={emotionValues[lane.id] || {}}
              onUpdatePoint={noop}
              onDelete={noop}
              onDuplicate={noop}
              onUpdate={noop}
              isMenuOpen={false}
              onToggleMenu={noop}
              onTogglePin={noop}
              readOnly
            />
          ) : (
            <TextLane
              key={lane.id}
              lane={lane}
              gridColumns={gridColumns}
              laneData={cells[lane.id] || {}}
              globalMetrics={globalMetrics}
              globalJourneys={globalJourneys}
              onAddCard={noop}
              onUpdateCard={noop}
              onDeleteCard={noop}
              onDelete={noop}
              onDuplicate={noop}
              onUpdate={noop}
              isMenuOpen={false}
              onToggleMenu={noop}
              onTogglePin={noop}
              onUploadImage={noop}
              onEditMetric={noop}
              onOpenLinkedJourneyPreview={onOpenLinkedJourneyPreview}
              readOnly
              isExport={isExport}
            />
          )
        )}
      </div>
    </div>
    </DndContext>
  );
}
