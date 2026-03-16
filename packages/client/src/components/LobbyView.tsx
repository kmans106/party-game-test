import { useState } from "react";
import {
  MIN_PLAYERS_TO_START,
  ROUND_TIMER_OPTIONS,
  TOTAL_ROUNDS_OPTIONS,
  type RoomState,
  type UpdateLobbySettingsInput
} from "@party-game/shared";

const AVATAR_COLORS = ["#c96442", "#5f8c72", "#5e81ac", "#8b7ec8", "#c49a3c", "#c75b7a"] as const;

type LobbyViewProps = {
  currentPlayerName: string;
  error: string | null;
  hostPlayerName: string;
  isHost: boolean;
  isSubmitting: boolean;
  onStartGame: () => void;
  onUpdateSettings: (input: UpdateLobbySettingsInput) => void;
  room: RoomState;
};

export const LobbyView = ({
  currentPlayerName,
  error,
  hostPlayerName,
  isHost,
  isSubmitting,
  onStartGame,
  onUpdateSettings,
  room
}: LobbyViewProps) => {
  const [copied, setCopied] = useState(false);
  const canStartGame = room.players.length >= MIN_PLAYERS_TO_START;
  const settingsDisabled = !isHost || isSubmitting;

  return (
    <section
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "12px",
        maxWidth: "560px",
        padding: "2rem",
        width: "100%"
      }}
    >
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          gap: "1rem",
          justifyContent: "space-between"
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Waiting for players</h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Share the room code to let friends join.
          </p>
        </div>
        <div
          style={{
            background: "var(--color-bg-sage)",
            border: "1px solid var(--color-border-sage)",
            borderRadius: "8px",
            flexShrink: 0,
            padding: "0.75rem 1rem",
            textAlign: "center"
          }}
        >
          <div
            style={{
              color: "var(--color-text-muted)",
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase"
            }}
          >
            Room Code
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              marginTop: "0.125rem"
            }}
          >
            {room.roomCode}
          </div>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(room.roomCode);
              setCopied(true);
              window.setTimeout(() => {
                setCopied(false);
              }, 1_500);
            }}
            style={{
              background: "transparent",
              border: "1px solid var(--color-border-input)",
              borderRadius: "4px",
              color: "var(--color-text-secondary)",
              fontSize: "0.75rem",
              fontWeight: 600,
              marginTop: "0.375rem",
              padding: "0.1875rem 0.5rem"
            }}
            type="button"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          marginTop: "1.25rem",
          paddingTop: "1.25rem"
        }}
      >
        <div
          style={{
            color: "var(--color-text-muted)",
            fontSize: "0.6875rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
            marginBottom: "0.625rem",
            textTransform: "uppercase"
          }}
        >
          Players ({room.players.length})
        </div>
        <div style={{ display: "grid", gap: "0.375rem" }}>
          {room.players.map((player, index) => (
            <div
              key={player.id}
              style={{
                alignItems: "center",
                background: "var(--color-bg-subtle)",
                borderRadius: "6px",
                display: "flex",
                gap: "0.625rem",
                padding: "0.5rem 0.75rem"
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  background: AVATAR_COLORS[index % AVATAR_COLORS.length],
                  borderRadius: "50%",
                  color: "#fff",
                  display: "flex",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  height: "1.75rem",
                  justifyContent: "center",
                  width: "1.75rem"
                }}
              >
                {player.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                  {player.name}
                  {player.name === currentPlayerName ? " (You)" : ""}
                </span>
              </div>
              {player.id === room.hostPlayerId ? (
                <span
                  style={{
                    background: "var(--color-accent-sage)",
                    borderRadius: "4px",
                    color: "#fff",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    padding: "0.125rem 0.375rem"
                  }}
                >
                  Host
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          marginTop: "1.25rem",
          paddingTop: "1.25rem"
        }}
      >
        <div
          style={{
            color: "var(--color-text-muted)",
            fontSize: "0.6875rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
            marginBottom: "0.625rem",
            textTransform: "uppercase"
          }}
        >
          Game settings
        </div>
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            marginBottom: "0.875rem"
          }}
        >
          <label style={{ display: "grid", gap: "0.375rem" }}>
            <span style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem", fontWeight: 600 }}>
              Rounds
            </span>
            <select
              disabled={settingsDisabled}
              onChange={(event) => {
                onUpdateSettings({
                  totalRounds: Number(event.target.value),
                  roundTimerSeconds: room.settings.roundTimerSeconds
                });
              }}
              style={{
                background: "var(--color-bg-subtle)",
                border: "1px solid var(--color-border-input)",
                borderRadius: "6px",
                color: "var(--color-text-primary)",
                fontSize: "0.9375rem",
                padding: "0.625rem 0.75rem"
              }}
              value={room.settings.totalRounds}
            >
              {TOTAL_ROUNDS_OPTIONS.map((rounds) => (
                <option key={rounds} value={rounds}>
                  {rounds}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.375rem" }}>
            <span style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem", fontWeight: 600 }}>
              Round timer
            </span>
            <select
              disabled={settingsDisabled}
              onChange={(event) => {
                onUpdateSettings({
                  totalRounds: room.settings.totalRounds,
                  roundTimerSeconds: Number(event.target.value)
                });
              }}
              style={{
                background: "var(--color-bg-subtle)",
                border: "1px solid var(--color-border-input)",
                borderRadius: "6px",
                color: "var(--color-text-primary)",
                fontSize: "0.9375rem",
                padding: "0.625rem 0.75rem"
              }}
              value={room.settings.roundTimerSeconds}
            >
              {ROUND_TIMER_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} seconds
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
          {canStartGame
            ? isHost
              ? "Ready to start when you are."
              : `Waiting for ${hostPlayerName} to start the game.`
            : `Need ${MIN_PLAYERS_TO_START - room.players.length} more player${MIN_PLAYERS_TO_START - room.players.length === 1 ? "" : "s"} to begin.`}
        </div>
        <button
          disabled={!isHost || isSubmitting || !canStartGame}
          onClick={onStartGame}
          style={{
            background: "var(--color-accent-terracotta)",
            border: "none",
            borderRadius: "6px",
            color: "#fff",
            fontWeight: 600,
            padding: "0.625rem 1rem",
            width: "100%"
          }}
          type="button"
        >
          {isSubmitting ? "Starting..." : isHost ? "Start game" : "Waiting for host"}
        </button>
      </div>

      {error ? (
        <div
          style={{
            background: "var(--color-bg-error)",
            border: "1px solid var(--color-border-error)",
            borderRadius: "6px",
            color: "var(--color-status-error)",
            fontSize: "0.8125rem",
            fontWeight: 600,
            marginTop: "0.75rem",
            padding: "0.625rem 0.75rem"
          }}
        >
          {error}
        </div>
      ) : null}
    </section>
  );
};
