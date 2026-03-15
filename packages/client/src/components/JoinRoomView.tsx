import { MAX_PLAYER_NAME_LENGTH, ROOM_CODE_LENGTH } from "@party-game/shared";

type JoinRoomViewProps = {
  devMode: boolean;
  devPlayerName: string;
  devRoomLabel: string;
  error: string | null;
  isConnected: boolean;
  isSubmitting: boolean;
  playerName: string;
  roomCode: string;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onPlayerNameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
};

export const JoinRoomView = ({
  devMode,
  devPlayerName,
  devRoomLabel,
  error,
  isConnected,
  isSubmitting,
  playerName,
  roomCode,
  onCreateRoom,
  onJoinRoom,
  onPlayerNameChange,
  onRoomCodeChange
}: JoinRoomViewProps) => {
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const trimmedPlayerName = playerName.trim();
  const canCreateRoom = isConnected && !isSubmitting && trimmedPlayerName.length > 0;
  const canJoinRoom =
    canCreateRoom && normalizedRoomCode.length === ROOM_CODE_LENGTH;

  if (devMode) {
    return (
      <section
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          maxWidth: "480px",
          padding: "2rem",
          width: "100%"
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
          Development Mode
        </div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.25rem" }}>
          Joining shared dev room
        </h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginTop: "0.5rem" }}>
          New tabs connect to <strong>{devRoomLabel}</strong> as <strong>{devPlayerName}</strong>.
        </p>
        {error ? (
          <div
            style={{
              background: "var(--color-bg-error)",
              border: "1px solid var(--color-border-error)",
              borderRadius: "6px",
              color: "var(--color-status-error)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              marginTop: "1rem",
              padding: "0.625rem 0.75rem"
            }}
          >
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "12px",
        maxWidth: "480px",
        padding: "2rem",
        width: "100%"
      }}
    >
      <h1 style={{ color: "var(--color-accent-terracotta)", fontSize: "1.5rem", fontWeight: 700 }}>Party Game</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
        Draw and guess with friends in real time.
      </p>

      <label style={{ display: "block", marginTop: "1.5rem" }}>
        <span
          style={{
            display: "block",
            fontSize: "0.8125rem",
            fontWeight: 600,
            marginBottom: "0.375rem"
          }}
        >
          Your name
        </span>
        <input
          maxLength={MAX_PLAYER_NAME_LENGTH}
          onChange={(event) => {
            onPlayerNameChange(event.target.value);
          }}
          placeholder="Enter a display name"
          style={{
            border: "1px solid var(--color-border-input)",
            borderRadius: "6px",
            display: "block",
            padding: "0.5rem 0.75rem",
            width: "100%"
          }}
          value={playerName}
        />
        <span
          style={{
            color: "var(--color-text-muted)",
            display: "block",
            fontSize: "0.75rem",
            marginTop: "0.25rem"
          }}
        >
          Up to {MAX_PLAYER_NAME_LENGTH} characters
        </span>
      </label>

      <div
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "1fr 1fr",
          marginTop: "1.25rem"
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canCreateRoom) {
              return;
            }

            onCreateRoom();
          }}
          style={{
            background: "var(--color-bg-peach)",
            border: "1px solid var(--color-border-warm)",
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            padding: "1rem"
          }}
        >
          <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>New game</div>
          <div
            style={{
              color: "var(--color-text-secondary)",
              flex: 1,
              fontSize: "0.75rem",
              lineHeight: 1.5,
              marginTop: "0.25rem"
            }}
          >
            Start a room and share the code with friends.
          </div>
          <button
            disabled={!canCreateRoom}
            style={{
              background: "var(--color-accent-terracotta)",
              border: "none",
              borderRadius: "6px",
              color: "#fff",
              fontWeight: 600,
              marginTop: "0.75rem",
              padding: "0.5rem 1rem"
            }}
            type="submit"
          >
            {isSubmitting ? "Creating..." : "Create room"}
          </button>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canJoinRoom) {
              return;
            }

            onJoinRoom();
          }}
          style={{
            background: "var(--color-bg-blue)",
            border: "1px solid var(--color-border-cool)",
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            padding: "1rem"
          }}
        >
          <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Join game</div>
          <div
            style={{
              color: "var(--color-text-secondary)",
              fontSize: "0.75rem",
              lineHeight: 1.5,
              marginTop: "0.25rem"
            }}
          >
            Enter a {ROOM_CODE_LENGTH}-character room code.
          </div>
          <input
            maxLength={ROOM_CODE_LENGTH}
            onChange={(event) => {
              onRoomCodeChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            }}
            placeholder="ABCD"
            style={{
              border: "1px solid var(--color-border-input)",
              borderRadius: "6px",
              letterSpacing: "0.2em",
              marginTop: "0.5rem",
              padding: "0.5rem 0.75rem",
              textTransform: "uppercase"
            }}
            value={roomCode}
          />
          <button
            disabled={!canJoinRoom}
            style={{
              background: "var(--color-accent-blue)",
              border: "none",
              borderRadius: "6px",
              color: "#fff",
              fontWeight: 600,
              marginTop: "0.5rem",
              padding: "0.5rem 1rem"
            }}
            type="submit"
          >
            {isSubmitting ? "Joining..." : "Join room"}
          </button>
        </form>
      </div>

      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "0.375rem",
          marginTop: "1.25rem"
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
        <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
          {isConnected ? "Connected to server" : "Connecting..."}
        </span>
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
