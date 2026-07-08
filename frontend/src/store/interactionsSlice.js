import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as api from "../api/api";

export const fetchInteractions = createAsyncThunk(
  "interactions/fetchAll",
  async (hcpId) => {
    const res = await api.listInteractions(hcpId);
    return res.data;
  }
);

export const submitStructuredInteraction = createAsyncThunk(
  "interactions/createStructured",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await api.createInteraction(payload);
      return res.data;
    } catch (err) {
      const detail = err?.response?.data?.detail;
      return rejectWithValue(
        typeof detail === "string" ? detail : JSON.stringify(detail) || "Failed to log interaction."
      );
    }
  }
);

export const editInteraction = createAsyncThunk(
  "interactions/edit",
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const res = await api.updateInteraction(id, payload);
      return res.data;
    } catch (err) {
      const detail = err?.response?.data?.detail;
      return rejectWithValue(
        typeof detail === "string" ? detail : JSON.stringify(detail) || "Failed to update interaction."
      );
    }
  }
);

export const removeInteraction = createAsyncThunk(
  "interactions/remove",
  async (id) => {
    await api.deleteInteraction(id);
    return id;
  }
);

const interactionsSlice = createSlice({
  name: "interactions",
  initialState: {
    items: [],
    status: "idle", // idle | loading | succeeded | failed
    error: null,
    selectedId: null,
  },
  reducers: {
    selectInteraction(state, action) {
      state.selectedId = action.payload;
    },
    upsertInteractionLocal(state, action) {
      const idx = state.items.findIndex((i) => i.id === action.payload.id);
      if (idx >= 0) {
        state.items[idx] = action.payload;
      } else {
        state.items.unshift(action.payload);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInteractions.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchInteractions.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload;
      })
      .addCase(fetchInteractions.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      })
      .addCase(submitStructuredInteraction.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(editInteraction.fulfilled, (state, action) => {
        const idx = state.items.findIndex((i) => i.id === action.payload.id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(removeInteraction.fulfilled, (state, action) => {
        state.items = state.items.filter((i) => i.id !== action.payload);
      });
  },
});

export const { selectInteraction, upsertInteractionLocal } = interactionsSlice.actions;
export default interactionsSlice.reducer;
