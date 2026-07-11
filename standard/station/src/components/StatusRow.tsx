import type { CheckStatus } from "../lib/types";

export type StatusAction = {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
};

type StatusRowProps = {
  label: string;
  status: CheckStatus;
  detail?: string;
  action?: StatusAction;
};

function lampClass(status: CheckStatus): string {
  if (status === "ok") return "status-lamp status-lamp-ok";
  if (status === "warning") return "status-lamp status-lamp-warning";
  return "status-lamp status-lamp-error";
}

export function StatusRow({ label, status, detail, action }: StatusRowProps) {
  const detailText = detail?.trim();

  return (
    <li className="status-row">
      <div className="status-row-top">
        <div className="status-row-main">
          <span className={lampClass(status)} aria-hidden />
          <span className="status-label">{label}</span>
        </div>
        <div className="status-row-action-slot">
          {action ? (
            <button
              type="button"
              className="btn btn-muted status-row-action"
              disabled={Boolean(action.disabled || action.busy)}
              onClick={action.onClick}
            >
              {action.busy ? "…" : action.label}
            </button>
          ) : null}
        </div>
      </div>
      <div className="status-row-detail-slot">
        {detailText ? <p className="status-row-detail">{detailText}</p> : null}
      </div>
    </li>
  );
}
