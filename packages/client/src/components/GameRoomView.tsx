import { useEffect, useRef, useState } from "react";
import {
  ChatMessageType,
  GamePhase,
  TurnStage,
  type CanvasStroke,
  type DrawerStatePayload,
  type RoomState
} from "@party-game/shared";

import { DrawingCanvas } from "./DrawingCanvas.js";

const DRAW_COLORS = ["#111827", "#ef4444", "#2563eb", "#16a34a", "#f59e0b", "#9333ea"] as const;
const BRUSH_SIZES = [4, 8, 12] as const;

const formatNameList = (names: string[]) => {
  if (names.length <= 1) {
    return names[0] ?? "Nobody";
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
};

const formatDurationSeconds = (durationMs: number | null) => {
  if (durationMs === null) {
    return "No correct guesses";
  }

  return `${(durationMs / 1000).toFixed(1)}s fastest guess`;
};

type GameRoomViewProps = {
  currentDrawerName: string;
  currentPlayerName: string;
  drawerState: DrawerStatePayload | null;
  error: string | null;
  hasGuessedCurrentTurn: boolean;
  isConnected: boolean;
  isHost: boolean;
  isCurrentPlayerDrawer: boolean;
  isCurrentDrawer: boolean;
  isSubmitting: boolean;
  onChooseWord: (word: string) => void;
  onClearCanvas: () => void;
  onReturnToLobby: () => void;
  onSendStroke: (stroke: CanvasStroke) => void;
  onSubmitGuess: (guess: string) => void;
  room: RoomState;
  strokes: CanvasStroke[];
};

export const GameRoomView = ({
  currentDrawerName,
  currentPlayerName,
  drawerState,
  error,
  hasGuessedCurrentTurn,
  isConnected,
  isHost,
  isCurrentPlayerDrawer,
  isCurrentDrawer,
  isSubmitting,
  onChooseWord,
  onClearCanvas,
  onReturnToLobby,
  onSendStroke,
  onSubmitGuess,
  room,
  strokes
}: GameRoomViewProps) => {
  const inviteLink = `${window.location.origin}/?room=${room.roomCode}`;
  const [guessText, setGuessText] = useState("");
  const [now, setNow] = useState(Date.now());
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [selectedColor, setSelectedColor] = useState<(typeof DRAW_COLORS)[number]>("#111827");
  const [selectedBrushSize, setSelectedBrushSize] = useState<(typeof BRUSH_SIZES)[number]>(4);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const rankedPlayers = [...room.players].sort(
    (leftPlayer, rightPlayer) =>
      rightPlayer.score - leftPlayer.score || leftPlayer.name.localeCompare(rightPlayer.name)
  );
  const topScore = rankedPlayers[0]?.score ?? 0;
  const winningPlayers = rankedPlayers.filter((player) => player.score === topScore);
  const gameSummary = room.gameSummary;
  const getPlayerName = (playerId: string) =>
    room.players.find((player) => player.id === playerId)?.name ?? "Unknown player";
  const winnerNames =
    gameSummary?.winnerPlayerIds.map(getPlayerName) ?? winningPlayers.map((player) => player.name);
  const fastestGuesserName = gameSummary?.fastestGuesserPlayerId
    ? getPlayerName(gameSummary.fastestGuesserPlayerId)
    : "Nobody";
  const mostCorrectGuesserNames =
    gameSummary?.mostCorrectGuessPlayerIds.map(getPlayerName) ?? [];
  const bestDrawerNames = gameSummary?.bestDrawerPlayerIds.map(getPlayerName) ?? [];
  const zeroCorrectGuessNames = gameSummary?.zeroCorrectGuessPlayerIds.map(getPlayerName) ?? [];
  const currentPlayerStanding = Math.max(
    1,
    rankedPlayers.findIndex((player) => player.name === currentPlayerName) + 1
  );
  const currentPlayerScore =
    rankedPlayers.find((player) => player.name === currentPlayerName)?.score ?? 0;
  const solvedPlayerNames =
    room.activeGame?.guessedPlayerIds
      .map((playerId) => room.players.find((player) => player.id === playerId)?.name)
      .filter((playerName): playerName is string => Boolean(playerName)) ?? [];
  const publicWordDisplay = isCurrentDrawer
    ? room.activeGame?.turnStage === TurnStage.Intermission
      ? room.activeGame?.revealedWord ?? drawerState?.selectedWord ?? "..."
      : drawerState?.selectedWord ?? "..."
    : room.activeGame?.turnStage === TurnStage.Intermission
      ? room.activeGame?.revealedWord ?? room.activeGame?.wordMask ?? "..."
      : room.activeGame?.wordMask ?? "...";
  const guessInputDisabled =
    !isConnected ||
    room.activeGame?.turnStage !== TurnStage.Drawing ||
    isCurrentPlayerDrawer ||
    hasGuessedCurrentTurn;
  const remainingSeconds =
    room.activeGame?.phaseEndsAt !== null && room.activeGame?.phaseEndsAt !== undefined
      ? Math.max(0, Math.ceil((room.activeGame.phaseEndsAt - now) / 1000))
      : null;
  const guessStatusLabel = !isConnected
    ? "Connection lost. Reconnecting..."
    : isCurrentPlayerDrawer
      ? "You are drawing this turn."
      : hasGuessedCurrentTurn
        ? "Correct guess locked in."
        : room.activeGame?.turnStage === TurnStage.Drawing
          ? "Submit guesses in chat."
          : room.activeGame?.turnStage === TurnStage.ChoosingWord
            ? "Waiting for the drawer to choose a word."
            : "Next turn is about to start.";

  useEffect(() => {
    setGuessText("");
  }, [room.activeGame?.currentDrawerPlayerId, room.activeGame?.roundNumber, room.activeGame?.turnStage]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const chatScroller = chatScrollRef.current;
    if (!chatScroller) {
      return;
    }

    chatScroller.scrollTop = chatScroller.scrollHeight;
  }, [room.chatMessages, room.activeGame?.turnStage, room.activeGame?.roundNumber]);

  // ── Game Over ──
  if (room.phase === GamePhase.Finished) {
    return (
      <main
        className="game-room game-room--finished"
        style={{
          background: "var(--color-bg-page)",
          boxSizing: "border-box",
          padding: "0.75rem"
        }}
      >
        <section
          className="game-room__shell game-room__shell--finished"
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateRows: "auto 1fr"
          }}
        >
          <header
            className="game-room__header game-room__header--finished"
            style={{
              alignItems: "center",
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              borderTop: "3px solid var(--color-accent-terracotta)",
              display: "flex",
              justifyContent: "space-between",
              padding: "0.75rem 1rem"
            }}
          >
            <div>
              <div
                style={{
                  color: "var(--color-text-muted)",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase"
                }}
              >
                Room {room.roomCode}
              </div>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                  setCopiedInviteLink(true);
                  window.setTimeout(() => {
                    setCopiedInviteLink(false);
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
                {copiedInviteLink ? "Invite copied!" : "Copy invite link"}
              </button>
              <div style={{ color: "var(--color-accent-terracotta)", fontSize: "1.25rem", fontWeight: 700 }}>Game Over</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  color: "var(--color-text-muted)",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase"
                }}
              >
                {winningPlayers.length > 1 ? "Winners" : "Winner"}
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                {winningPlayers.map((player) => player.name).join(", ")}
              </div>
            </div>
          </header>

          <section
            className="game-room__finished-body"
            style={{
              display: "grid",
              gap: "0.75rem",
              minHeight: 0
            }}
          >
            <section
              className="game-room__finished-standings"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                overflow: "auto",
                padding: "1.25rem"
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
                Final Standings
              </div>
              <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
                {rankedPlayers.map((player, index) => (
                  <div
                    key={player.id}
                    style={{
                      alignItems: "center",
                      background:
                        index === 0
                          ? "var(--color-bg-gold)"
                          : player.name === currentPlayerName
                            ? "var(--color-bg-peach)"
                            : "var(--color-bg-subtle)",
                      border: index === 0
                        ? "1px solid var(--color-border-gold)"
                        : "1px solid var(--color-border)",
                      borderRadius: "6px",
                      display: "flex",
                      gap: "0.75rem",
                      padding: "0.75rem"
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        minWidth: "2.5rem",
                        textAlign: "center"
                      }}
                    >
                      #{index + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>
                        {player.name}
                        {player.name === currentPlayerName ? " (You)" : ""}
                      </div>
                      <div style={{ color: "var(--color-text-secondary)", fontSize: "0.75rem" }}>
                        {index === 0 ? "Top score" : `${topScore - player.score} behind first`}
                      </div>
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 700 }}>{player.score} pts</div>
                  </div>
                ))}
              </div>
            </section>

            <aside
              className="game-room__finished-summary"
              style={{
                alignContent: "start",
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                display: "grid",
                gap: "1rem",
                overflow: "auto",
                padding: "1.25rem"
              }}
            >
              <div>
                <div
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase"
                  }}
                >
                  Summary
                </div>
                <div style={{ fontSize: "1.125rem", fontWeight: 700, marginTop: "0.25rem" }}>
                  {winnerNames.length > 1 ? "Tie game" : `${winnerNames[0] ?? "Nobody"} wins`}
                </div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem", lineHeight: 1.5, marginTop: "0.25rem" }}>
                  {room.chatMessages.at(-1)?.text ?? "The match is complete."}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "0.625rem"
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
                  Awards
                </div>

                {[
                  {
                    label: "Winner",
                    value: formatNameList(winnerNames),
                    detail: `${topScore} point${topScore === 1 ? "" : "s"}`
                  },
                  {
                    label: "Fastest Guesser",
                    value: fastestGuesserName,
                    detail: formatDurationSeconds(gameSummary?.fastestGuessMs ?? null)
                  },
                  {
                    label: "Most Correct Guesses",
                    value:
                      mostCorrectGuesserNames.length > 0
                        ? formatNameList(mostCorrectGuesserNames)
                        : "Nobody",
                    detail: `${gameSummary?.mostCorrectGuessCount ?? 0} correct guess${
                      (gameSummary?.mostCorrectGuessCount ?? 0) === 1 ? "" : "es"
                    }`
                  },
                  {
                    label: "Best Drawer",
                    value: bestDrawerNames.length > 0 ? formatNameList(bestDrawerNames) : "Nobody",
                    detail: `${gameSummary?.bestDrawerPoints ?? 0} drawer point${
                      (gameSummary?.bestDrawerPoints ?? 0) === 1 ? "" : "s"
                    }`
                  }
                ].map((award) => (
                  <div
                    key={award.label}
                    style={{
                      background: "var(--color-bg-subtle)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "6px",
                      padding: "0.75rem"
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
                      {award.label}
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: "0.1875rem" }}>
                      {award.value}
                    </div>
                    <div style={{ color: "var(--color-text-secondary)", fontSize: "0.75rem", marginTop: "0.125rem" }}>
                      {award.detail}
                    </div>
                  </div>
                ))}

                {zeroCorrectGuessNames.length > 0 ? (
                  <div
                    style={{
                      background: "var(--color-bg-error)",
                      border: "1px solid var(--color-border-error)",
                      borderRadius: "6px",
                      color: "var(--color-status-error)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      lineHeight: 1.5,
                      padding: "0.75rem"
                    }}
                  >
                    {`Yikes, ${formatNameList(zeroCorrectGuessNames)} — better luck next time.`}
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  background: "var(--color-bg-peach)",
                  border: "1px solid var(--color-border-warm)",
                  borderRadius: "6px",
                  padding: "0.75rem"
                }}
              >
                <div
                  style={{
                    color: "var(--color-accent-terracotta)",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase"
                  }}
                >
                  Your Result
                </div>
                <div style={{ color: "var(--color-accent-terracotta)", fontSize: "1.5rem", fontWeight: 700, marginTop: "0.125rem" }}>
                  #{currentPlayerStanding}
                </div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem" }}>
                  {currentPlayerScore} points
                </div>
              </div>

              <div>
                {isHost ? (
                  <button
                    disabled={isSubmitting || !isConnected}
                    onClick={onReturnToLobby}
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
                    Return to lobby
                  </button>
                ) : (
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem", lineHeight: 1.5 }}>
                    Waiting for the host to return the room to the lobby.
                  </div>
                )}
              </div>
            </aside>
          </section>
        </section>
      </main>
    );
  }

  // ── Playing ──
  return (
    <main
      className="game-room"
      style={{
        background: "var(--color-bg-page)",
        boxSizing: "border-box",
        padding: "0.5rem"
      }}
    >
      {!isConnected ? (
        <div
          style={{
            background: "var(--color-bg-warning)",
            border: "1px solid var(--color-border-warning)",
            borderRadius: "6px",
            color: "var(--color-text-warning)",
            fontSize: "0.8125rem",
            fontWeight: 600,
            marginBottom: "0.5rem",
            padding: "0.5rem 0.75rem"
          }}
        >
          Reconnecting to the server. Inputs are temporarily disabled.
        </div>
      ) : null}
      <section
        className={`game-room__shell${isConnected ? "" : " game-room__shell--with-banner"}`}
        style={{
          display: "grid",
          gap: "0.5rem",
          gridTemplateRows: "auto 1fr"
        }}
      >
        {/* ── Header ── */}
        <header
          className="game-room__header"
          style={{
            alignItems: "center",
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            borderTop: "3px solid var(--color-accent-terracotta)",
            display: "grid",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem"
          }}
        >
          <div className="game-room__header-panel game-room__header-panel--left">
            <div
              style={{
                color: "var(--color-text-muted)",
                fontSize: "0.6875rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase"
              }}
            >
              Room {room.roomCode}
            </div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 700, lineHeight: 1.2 }}>
              Round {room.activeGame?.roundNumber ?? "-"} / {room.activeGame?.totalRounds ?? "-"}
            </div>
            <button
              className="game-room__invite-button"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink);
                setCopiedInviteLink(true);
                window.setTimeout(() => {
                  setCopiedInviteLink(false);
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
              {copiedInviteLink ? "Invite copied!" : "Copy invite link"}
            </button>
          </div>
          <div className="game-room__header-panel game-room__header-panel--center" style={{ textAlign: "center" }}>
            <div
              style={{
                color: "var(--color-accent-terracotta)",
                fontSize: "0.6875rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase"
              }}
            >
              Word
            </div>
            <div
              className="game-room__word-display"
              style={{
                color: "var(--color-text-primary)",
                fontSize: "1.25rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                lineHeight: 1.2
              }}
            >
              {publicWordDisplay}
            </div>
          </div>
          <div className="game-room__header-panel game-room__header-panel--right" style={{ textAlign: "right" }}>
            <div
              style={{
                alignItems: "center",
                display: "flex",
                fontSize: "0.6875rem",
                fontWeight: 600,
                gap: "0.25rem",
                justifyContent: "flex-end",
                letterSpacing: "0.05em",
                marginBottom: "0.125rem",
                textTransform: "uppercase"
              }}
            >
              <span
                style={{
                  background: isConnected ? "var(--color-status-success)" : "var(--color-status-warning)",
                  borderRadius: "50%",
                  display: "inline-block",
                  height: "6px",
                  width: "6px"
                }}
              />
              <span style={{ color: isConnected ? "var(--color-status-success)" : "var(--color-status-warning)" }}>
                {isConnected ? "Live" : "Reconnecting"}
              </span>
            </div>
            <div
              style={{
                color: "var(--color-text-muted)",
                fontSize: "0.6875rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase"
              }}
            >
              {room.activeGame?.turnStage === TurnStage.ChoosingWord
                ? "Choosing"
                : room.activeGame?.turnStage === TurnStage.Drawing
                  ? "Time left"
                  : "Next turn"}
            </div>
            <div className="game-room__timer-value" style={{ fontSize: "0.9375rem", fontWeight: 700, lineHeight: 1.2 }}>
              {remainingSeconds ?? "-"}s
            </div>
          </div>
        </header>

        {/* ── Three-column body ── */}
        <section
          className="game-room__body"
          style={{
            display: "grid",
            gap: "0.5rem",
            minHeight: 0
          }}
        >
          {/* ── Scoreboard ── */}
          <aside
            className="game-room__scoreboard"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderLeft: "3px solid var(--color-accent-purple)",
              borderRadius: "8px",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                borderBottom: "1px solid var(--color-border)",
                padding: "0.625rem 0.75rem"
              }}
            >
              <div
                style={{
                  color: "var(--color-accent-purple)",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase"
                }}
              >
                Scoreboard
              </div>
            </div>
            <div style={{ overflowY: "auto" }}>
              {rankedPlayers.map((player, index) => {
                const isDrawing = player.id === room.activeGame?.currentDrawerPlayerId;
                const hasGuessed = room.activeGame?.guessedPlayerIds.includes(player.id) ?? false;
                return (
                  <div
                    key={player.id}
                    style={{
                      borderBottom:
                        index < rankedPlayers.length - 1 ? "1px solid var(--color-border-divider)" : "none",
                      display: "flex",
                      gap: "0.5rem",
                      padding: "0.5rem 0.75rem"
                    }}
                  >
                    <div
                      style={{
                        color: "var(--color-text-muted)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        minWidth: "1.5rem"
                      }}
                    >
                      {index + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {player.name}
                        {player.name === currentPlayerName ? " (You)" : ""}
                      </div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
                        {player.score} pts
                        {!player.isConnected ? " \u00B7 reconnecting" : ""}
                        {isDrawing
                          ? " \u00B7 drawing"
                          : hasGuessed
                            ? " \u00B7 guessed"
                            : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* ── Center: Canvas area ── */}
          <section
            className="game-room__center"
            style={{
              display: "grid",
              gridTemplateRows: "minmax(0, 1fr) auto",
              minHeight: 0
            }}
          >
            <div
              className="game-room__canvas-card"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                display: "grid",
                gridTemplateRows: "auto minmax(0, 1fr)",
                minHeight: 0,
                overflow: "hidden",
                padding: "0.625rem"
              }}
            >
              {/* Stat row */}
              <div
                className="game-room__stats"
                style={{
                  display: "grid",
                  gap: "0.375rem",
                  marginBottom: "0.5rem"
                }}
              >
                <div
                  style={{
                    background: "var(--color-bg-peach)",
                    borderRadius: "6px",
                    padding: "0.375rem 0.625rem"
                  }}
                >
                  <div
                    style={{
                      color: "var(--color-text-warm)",
                      fontSize: "0.625rem",
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase"
                    }}
                  >
                    Standing
                  </div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 700 }}>
                    #{currentPlayerStanding}
                    <span style={{ color: "var(--color-text-warm)", fontSize: "0.75rem", fontWeight: 500, marginLeft: "0.25rem" }}>
                      {currentPlayerScore} pts
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    background: "var(--color-bg-sage)",
                    borderRadius: "6px",
                    padding: "0.375rem 0.625rem"
                  }}
                >
                  <div
                    style={{
                      color: "var(--color-accent-sage)",
                      fontSize: "0.625rem",
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase"
                    }}
                  >
                    Solved
                  </div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 700 }}>
                    {solvedPlayerNames.length === 0 ? "None yet" : `${solvedPlayerNames.length} player${solvedPlayerNames.length > 1 ? "s" : ""}`}
                  </div>
                </div>
                <div
                  style={{
                    background: "var(--color-bg-blue)",
                    borderRadius: "6px",
                    padding: "0.375rem 0.625rem"
                  }}
                >
                  <div
                    style={{
                      color: "var(--color-accent-blue)",
                      fontSize: "0.625rem",
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase"
                    }}
                  >
                    Turn
                  </div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 700 }}>
                    {room.activeGame?.turnStage === TurnStage.Drawing
                      ? isCurrentDrawer
                        ? "You are drawing"
                        : "Guess the word"
                      : room.activeGame?.turnStage === TurnStage.ChoosingWord
                        ? "Choosing word"
                        : "Intermission"}
                  </div>
                </div>
              </div>

              {/* Canvas content area */}
              <div style={{ minHeight: 0, overflow: "hidden" }}>
                {room.activeGame?.turnStage === TurnStage.ChoosingWord ? (
                  isCurrentDrawer ? (
                    <div
                      style={{
                        alignContent: "center",
                        display: "grid",
                        justifyItems: "center",
                        minHeight: "100%",
                        padding: "1rem",
                        textAlign: "center"
                      }}
                    >
                      <div style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                        Choose a word
                      </div>
                      <div style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
                        Auto-picks in {remainingSeconds ?? "-"}s
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gap: "0.5rem",
                          maxWidth: "20rem",
                          width: "100%"
                        }}
                      >
                        {drawerState?.wordChoices.map((wordChoice, wordIndex) => {
                          const wordColors = ["var(--color-bg-peach)", "var(--color-bg-sage)", "var(--color-bg-blue)"];
                          const wordBorders = ["var(--color-border-warm)", "var(--color-border-sage)", "var(--color-border-cool)"];
                          return (
                            <button
                              key={wordChoice}
                              disabled={isSubmitting || !isConnected}
                              onClick={() => {
                                onChooseWord(wordChoice);
                              }}
                              style={{
                                background: wordColors[wordIndex % wordColors.length],
                                border: `1px solid ${wordBorders[wordIndex % wordBorders.length]}`,
                                borderRadius: "6px",
                                color: "var(--color-text-primary)",
                                fontSize: "1rem",
                                fontWeight: 700,
                                padding: "0.75rem 1rem",
                                textTransform: "capitalize"
                              }}
                              type="button"
                            >
                              {wordChoice}
                            </button>
                          );
                        }) ?? null}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        alignContent: "center",
                        color: "var(--color-text-secondary)",
                        display: "grid",
                        fontSize: "0.9375rem",
                        fontWeight: 600,
                        justifyItems: "center",
                        minHeight: "100%",
                        textAlign: "center"
                      }}
                    >
                      {currentDrawerName} is choosing a word. Starting in {remainingSeconds ?? "-"}s.
                    </div>
                  )
                ) : room.activeGame?.turnStage === TurnStage.Intermission ? (
                  <div
                    style={{
                      alignContent: "center",
                      display: "grid",
                      justifyItems: "center",
                      minHeight: "100%",
                      padding: "1rem",
                      textAlign: "center"
                    }}
                  >
                    <div style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
                      Turn complete. Next drawer in {remainingSeconds ?? "-"}s.
                    </div>
                    <div
                      style={{
                        background: "var(--color-bg-subtle)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "6px",
                        fontSize: "1rem",
                        fontWeight: 700,
                        padding: "1rem 1.5rem"
                      }}
                    >
                      The word was: {room.activeGame?.revealedWord ?? "Unknown"}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                    {/* Toolbar */}
                    {isCurrentDrawer ? (
                      <div
                        className="game-room__toolbar"
                        style={{
                          alignItems: "center",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                          marginBottom: "0.375rem"
                        }}
                      >
                        <div className="game-room__tool-group" style={{ display: "flex", gap: "0.25rem" }}>
                          {DRAW_COLORS.map((color) => (
                            <button
                              aria-label={`Use ${color} ink`}
                              className="game-room__tool-button"
                              key={color}
                              onClick={() => {
                                setSelectedColor(color);
                              }}
                              style={{
                                background: color,
                                border:
                                  color === selectedColor
                                    ? "2px solid var(--color-draw-selected-ring)"
                                    : "2px solid transparent",
                                borderRadius: "50%",
                                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)",
                                height: "1.5rem",
                                width: "1.5rem"
                              }}
                              type="button"
                            />
                          ))}
                        </div>
                        <div
                          style={{
                            background: "var(--color-toolbar-divider)",
                            height: "1rem",
                            width: "1px"
                          }}
                        />
                        <div className="game-room__tool-group" style={{ display: "flex", gap: "0.25rem" }}>
                          {BRUSH_SIZES.map((brushSize) => (
                            <button
                              aria-label={`Brush size ${brushSize}`}
                              className="game-room__tool-button"
                              key={brushSize}
                              onClick={() => {
                                setSelectedBrushSize(brushSize);
                              }}
                              style={{
                                alignItems: "center",
                                background:
                                  brushSize === selectedBrushSize
                                    ? "var(--color-brush-active-bg)"
                                    : "var(--color-brush-inactive-bg)",
                                border: "1px solid var(--color-border-input)",
                                borderRadius: "50%",
                                display: "flex",
                                height: "1.75rem",
                                justifyContent: "center",
                                width: "1.75rem"
                              }}
                              type="button"
                            >
                              <span
                                style={{
                                  background:
                                    brushSize === selectedBrushSize
                                      ? "var(--color-brush-active-dot)"
                                      : "var(--color-brush-inactive-dot)",
                                  borderRadius: "50%",
                                  display: "block",
                                  height: `${brushSize}px`,
                                  width: `${brushSize}px`
                                }}
                              />
                            </button>
                          ))}
                        </div>
                        <div
                          style={{
                            background: "var(--color-toolbar-divider)",
                            height: "1rem",
                            width: "1px"
                          }}
                        />
                        <button
                          className="game-room__clear-button"
                          disabled={!isConnected}
                          onClick={onClearCanvas}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--color-border-input)",
                            borderRadius: "4px",
                            color: "var(--color-text-secondary)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "0.25rem 0.5rem"
                          }}
                          type="button"
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", marginBottom: "0.375rem" }}>
                        {currentDrawerName} is drawing. {remainingSeconds ?? "-"}s left.
                      </div>
                    )}
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <DrawingCanvas
                        canDraw={isCurrentDrawer && isConnected}
                        color={selectedColor}
                        onStroke={onSendStroke}
                        strokeWidth={selectedBrushSize}
                        strokes={strokes}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Player badge */}
            <div
              className="game-room__player-badge"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                margin: "-0.75rem auto 0",
                padding: "0.375rem 0.75rem",
                textAlign: "center"
              }}
            >
              <div style={{ color: "var(--color-text-muted)", fontSize: "0.625rem", fontWeight: 600, textTransform: "uppercase" }}>
                Player
              </div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 700 }}>{currentPlayerName}</div>
            </div>
          </section>

          {/* ── Chat / Guesses ── */}
          <aside
            className="game-room__chat"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              borderRight: "3px solid var(--color-accent-blue)",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              minHeight: 0,
              overflow: "hidden"
            }}
          >
            <div
              style={{
                borderBottom: "1px solid var(--color-border)",
                padding: "0.625rem 0.75rem"
              }}
            >
              <div
                style={{
                  color: "var(--color-accent-blue)",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase"
                }}
              >
                Guesses
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", marginTop: "0.125rem" }}>
                {guessStatusLabel}
              </div>
            </div>
            <div
              ref={chatScrollRef}
              style={{
                overflowY: "auto",
                padding: "0.5rem 0.625rem"
              }}
            >
              {room.chatMessages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    borderLeft:
                      message.type === ChatMessageType.Correct
                        ? "2px solid var(--color-status-success)"
                        : message.type === ChatMessageType.System
                          ? "2px solid var(--color-status-system)"
                          : "2px solid transparent",
                    marginBottom: "0.375rem",
                    padding: "0.375rem 0.5rem"
                  }}
                >
                  <div
                    style={{
                      color:
                        message.type === ChatMessageType.Correct
                          ? "var(--color-text-correct)"
                          : message.type === ChatMessageType.System
                            ? "var(--color-text-system)"
                            : "var(--color-text-muted)",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      lineHeight: 1.2,
                      textTransform: "uppercase"
                    }}
                  >
                    {message.type === ChatMessageType.System
                      ? "System"
                      : message.type === ChatMessageType.Correct
                        ? message.playerName === currentPlayerName
                          ? "Correct"
                          : "Solved"
                        : message.playerName === currentPlayerName
                          ? "You"
                          : message.playerName ?? "Player"}
                  </div>
                  <div style={{ fontSize: "0.8125rem", lineHeight: 1.4, marginTop: "0.0625rem" }}>
                    {message.type === ChatMessageType.Correct && message.playerName === currentPlayerName
                      ? "You guessed the word."
                      : message.text}
                  </div>
                </div>
              ))}
            </div>
            <form
              className="game-room__chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (guessInputDisabled || guessText.trim().length === 0) {
                  return;
                }

                onSubmitGuess(guessText);
                setGuessText("");
              }}
              style={{
                borderTop: "1px solid var(--color-border)",
                display: "grid",
                gap: "0.375rem",
                padding: "0.625rem 0.75rem"
              }}
            >
              <input
                disabled={guessInputDisabled}
                onChange={(event) => {
                  setGuessText(event.target.value);
                }}
                placeholder={
                  isCurrentPlayerDrawer
                    ? "You are drawing"
                    : hasGuessedCurrentTurn
                      ? "Already guessed"
                      : room.activeGame?.turnStage === TurnStage.Drawing
                        ? "Type your guess..."
                        : "Waiting..."
                }
                style={{
                  border: "1px solid var(--color-border-input)",
                  borderRadius: "6px",
                  padding: "0.375rem 0.625rem",
                  width: "100%"
                }}
                value={guessText}
              />
              <button
                disabled={guessInputDisabled || guessText.trim().length === 0 || isSubmitting}
                style={{
                  background: "var(--color-accent-terracotta)",
                  border: "none",
                  borderRadius: "6px",
                  color: "#fff",
                  fontWeight: 600,
                  padding: "0.375rem 0.625rem",
                  width: "100%"
                }}
              >
                {isSubmitting ? "Sending..." : "Submit"}
              </button>
            </form>
          </aside>
        </section>

        {error ? (
          <div
            style={{
              background: "var(--color-bg-error)",
              border: "1px solid var(--color-border-error)",
              borderRadius: "6px",
              color: "var(--color-status-error)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              padding: "0.5rem 0.75rem"
            }}
          >
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
};
