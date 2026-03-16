import { useEffect, useState } from "react";
import { GamePhase } from "@party-game/shared";

import { GameRoomView } from "./components/GameRoomView.js";
import { JoinRoomView } from "./components/JoinRoomView.js";
import { LobbyView } from "./components/LobbyView.js";
import { getDevRoomLabel, useRoomConnection } from "./hooks/useRoomConnection.js";
import { useTheme } from "./hooks/useTheme.js";

const getDevPlayerName = () => {
  const existingPlayerName = window.sessionStorage.getItem("party-game-dev-player-name");
  if (existingPlayerName) {
    return existingPlayerName;
  }

  const nextPlayerName = `Player-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  window.sessionStorage.setItem("party-game-dev-player-name", nextPlayerName);
  return nextPlayerName;
};

const getSavedPlayerName = () => window.sessionStorage.getItem("party-game-player-name") ?? "";

export const App = () => {
  const [playerName, setPlayerName] = useState(getSavedPlayerName);
  const [roomCode, setRoomCode] = useState("");
  const { theme, toggleTheme } = useTheme();
  const {
    bootstrapDevRoom,
    chooseWord,
    clearCanvas,
    createRoom,
    drawerState,
    error,
    isConnected,
    isSubmitting,
    joinRoom,
    playerId,
    returnToLobby,
    room,
    sendStroke,
    strokes,
    submitGuess,
    startGame,
    updateLobbySettings
  } = useRoomConnection();

  const currentPlayer = room?.players.find((player) => player.id === playerId) ?? null;
  const hostPlayer = room?.players.find((player) => player.id === room.hostPlayerId) ?? null;
  const currentDrawer =
    room?.players.find((player) => player.id === room.activeGame?.currentDrawerPlayerId) ?? null;
  const isHost = playerId !== null && room?.hostPlayerId === playerId;
  const isCurrentDrawer = playerId !== null && room?.activeGame?.currentDrawerPlayerId === playerId;
  const hasGuessedCurrentTurn =
    playerId !== null && (room?.activeGame?.guessedPlayerIds.includes(playerId) ?? false);
  const devMode = import.meta.env.DEV;

  useEffect(() => {
    if (!devMode || !isConnected || room || isSubmitting) {
      return;
    }

    bootstrapDevRoom(getDevPlayerName());
  }, [bootstrapDevRoom, devMode, isConnected, isSubmitting, room]);

  useEffect(() => {
    window.sessionStorage.setItem("party-game-player-name", playerName);
  }, [playerName]);

  const themeToggle = (
    <button
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      style={{
        alignItems: "center",
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "50%",
        bottom: "1rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        color: "var(--color-text-primary)",
        cursor: "pointer",
        display: "flex",
        fontSize: "1.125rem",
        height: "2.25rem",
        justifyContent: "center",
        lineHeight: 1,
        position: "fixed",
        right: "1rem",
        width: "2.25rem",
        zIndex: 1000
      }}
      type="button"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );

  if (room && room.phase !== GamePhase.Lobby) {
    return (
      <>
        {themeToggle}
        <GameRoomView
          currentDrawerName={currentDrawer?.name ?? "Unknown player"}
          currentPlayerName={currentPlayer?.name ?? "Unknown player"}
          drawerState={drawerState}
          error={error}
          hasGuessedCurrentTurn={hasGuessedCurrentTurn}
          isConnected={isConnected}
          isHost={isHost}
          isCurrentPlayerDrawer={isCurrentDrawer}
          isCurrentDrawer={isCurrentDrawer}
          isSubmitting={isSubmitting}
          onChooseWord={(word) => {
            chooseWord({
              word
            });
          }}
          onClearCanvas={clearCanvas}
          onSendStroke={sendStroke}
          onSubmitGuess={(guess) => {
            submitGuess({
              guess
            });
          }}
          onReturnToLobby={returnToLobby}
          room={room}
          strokes={strokes}
        />
      </>
    );
  }

  return (
    <>
      {themeToggle}
      <main
        style={{
          display: "grid",
          minHeight: "100vh",
          padding: "1.5rem",
          placeItems: "center"
        }}
      >
        {!room ? (
          <JoinRoomView
            devMode={devMode}
            devPlayerName={getDevPlayerName()}
            devRoomLabel={getDevRoomLabel()}
            error={error}
            isConnected={isConnected}
            isSubmitting={isSubmitting}
            onCreateRoom={() => {
              createRoom({
                playerName
              });
            }}
            onJoinRoom={() => {
              joinRoom({
                playerName,
                roomCode
              });
            }}
            onPlayerNameChange={setPlayerName}
            onRoomCodeChange={setRoomCode}
            playerName={playerName}
            roomCode={roomCode}
          />
        ) : room.phase === GamePhase.Lobby ? (
          <LobbyView
            currentPlayerName={currentPlayer?.name ?? "Unknown player"}
            error={error}
            hostPlayerName={hostPlayer?.name ?? "None"}
            isHost={isHost}
            isSubmitting={isSubmitting}
            onStartGame={startGame}
            onUpdateSettings={updateLobbySettings}
            room={room}
          />
        ) : null}
      </main>
    </>
  );
};
