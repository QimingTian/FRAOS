type ToolbarProps = {
  customMosaic: boolean
  isMosaic: boolean
  horizontalPanels: number
  verticalPanels: number
  horizontalOverlapPercent: number
  verticalOverlapPercent: number
  panelCount: number
  onCustomMosaic: (v: boolean) => void
  onHorizontalPanels: (n: number) => void
  onVerticalPanels: (n: number) => void
  onHorizontalOverlapPercent: (v: number) => void
  onVerticalOverlapPercent: (v: number) => void
  onAddPanel: () => void
  customPanelNames: Array<{ id: number; name: string }>
  deletePanelId: number
  onDeletePanelIdChange: (id: number) => void
  onDeletePanel: () => void
}

function clampPanel(n: number): number {
  return Math.max(1, Math.min(20, Math.round(n)))
}

export function AtlasFramingToolbar({
  customMosaic,
  isMosaic,
  horizontalPanels,
  verticalPanels,
  horizontalOverlapPercent,
  verticalOverlapPercent,
  panelCount,
  onCustomMosaic,
  onHorizontalPanels,
  onVerticalPanels,
  onHorizontalOverlapPercent,
  onVerticalOverlapPercent,
  onAddPanel,
  customPanelNames,
  deletePanelId,
  onDeletePanelIdChange,
  onDeletePanel,
}: ToolbarProps) {
  const pill =
    'inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/50 px-2 py-1 text-xs text-white/90 backdrop-blur'
  const inputCls =
    'w-12 rounded border border-white/20 bg-black/40 px-1 py-0.5 text-center text-xs text-white'

  return (
    <div className="pointer-events-auto mt-2 flex flex-wrap items-center gap-2">
      <div className={pill}>
        <button
          type="button"
          onClick={() => onCustomMosaic(false)}
          className={
            !customMosaic ? 'font-semibold text-white' : 'text-white/50 hover:text-white/80'
          }
        >
          Grid
        </button>
        <span className="text-white/30">|</span>
        <button
          type="button"
          onClick={() => onCustomMosaic(true)}
          className={
            customMosaic ? 'font-semibold text-white' : 'text-white/50 hover:text-white/80'
          }
        >
          Custom
        </button>
      </div>

      {customMosaic ? (
        <>
          <button type="button" onClick={onAddPanel} className={pill}>
            Add Panel
          </button>
          <label className={`${pill} gap-2`}>
            <span>Panel</span>
            <select
              value={deletePanelId}
              onChange={(e) => onDeletePanelIdChange(Number.parseInt(e.target.value, 10))}
              className="max-w-[7rem] border-0 bg-transparent text-xs text-white outline-none"
              aria-label="Panel to delete"
            >
              {customPanelNames.map((p) => (
                <option key={p.id} value={p.id} className="bg-neutral-900 text-white">
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onDeletePanel}
            disabled={panelCount <= 1}
            className={`${pill} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Delete
          </button>
          {panelCount > 0 ? (
            <span className={`${pill} text-emerald-300`}>{panelCount} panels</span>
          ) : null}
        </>
      ) : (
        <>
          <label className={pill}>
            H
            <input
              type="number"
              min={1}
              max={20}
              value={horizontalPanels}
              onChange={(e) => onHorizontalPanels(clampPanel(Number(e.target.value) || 1))}
              className={inputCls}
            />
          </label>
          <label className={pill}>
            H overlap %
            <input
              type="number"
              min={0}
              max={100}
              value={horizontalOverlapPercent}
              onChange={(e) =>
                onHorizontalOverlapPercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
              }
              className={inputCls}
            />
          </label>
          <label className={pill}>
            V
            <input
              type="number"
              min={1}
              max={20}
              value={verticalPanels}
              onChange={(e) => onVerticalPanels(clampPanel(Number(e.target.value) || 1))}
              className={inputCls}
            />
          </label>
          <label className={pill}>
            V overlap %
            <input
              type="number"
              min={0}
              max={100}
              value={verticalOverlapPercent}
              onChange={(e) =>
                onVerticalOverlapPercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
              }
              className={inputCls}
            />
          </label>
          {isMosaic ? (
            <span className={`${pill} text-emerald-300`}>{panelCount} panels</span>
          ) : null}
        </>
      )}
    </div>
  )
}
