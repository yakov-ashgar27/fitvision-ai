import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import Login from "./Login";

describe("Login", () => {
  it("shows the server's Hebrew error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: 'דוא"ל או סיסמה שגויים' }), { status: 401, headers: { "content-type": "application/json" } })));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AuthProvider>
            <Login />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('דוא"ל'), { target: { value: "a@b.io" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "כניסה" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("שגויים"));
  });
});
