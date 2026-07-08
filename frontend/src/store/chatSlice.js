import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as api from "../api/api";
import { upsertInteractionLocal, fetchInteractions } from "./interactionsSlice";

export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async (payload, { dispatch }) => {
    const res = await api.sendChatMessage(payload);
    const data = res.data;

    if (data.interaction) {
      const isLog = data.tool_calls?.includes("log_interaction");
      if (isLog) {
        // The interaction was persisted to the DB by the agent.
        // Add it to local state immediately so it appears in the history panel
        // without waiting for a full re-fetch.
        dispatch(upsertInteractionLocal(data.interaction));
        // Also do a full server re-fetch so the list is always in sync
        // (covers cases where the hcp_id changed via AI extraction).
        dispatch(fetchInteractions(null));
      } else {
        // For edit / other tool calls, update the local entry.
        dispatch(upsertInteractionLocal(data.interaction));
      }
    }
    return data;
  }
);

const chatSlice = createSlice({
  name: "chat",
  initialState: {
    sessionId: `session-${Date.now()}`,
    messages: [], // { role: 'rep' | 'agent', text }
    status: "idle",
  },
  reducers: {
    addUserMessage(state, action) {
      state.messages.push({ role: "rep", text: action.payload });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendMessage.pending, (state) => {
        state.status = "loading";
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.messages.push({
          role: "agent",
          text: action.payload.reply,
          toolCalls: action.payload.tool_calls,
        });
      })
      .addCase(sendMessage.rejected, (state) => {
        state.status = "failed";
        state.messages.push({
          role: "agent",
          text: "Sorry, something went wrong reaching the AI agent.",
        });
      });
  },
});

export const { addUserMessage } = chatSlice.actions;
export default chatSlice.reducer;
