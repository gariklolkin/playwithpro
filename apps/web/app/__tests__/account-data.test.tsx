import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  AccountDataRequestKind,
  AccountDataRequestStatus,
  Role,
  ServiceType,
  SessionStatus,
  type MeResponse,
} from "@playwithpro/shared";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { DeleteAccountCard } from "@/components/account/delete-account-card";
import { DeletionGate } from "@/components/account/deletion-gate";
import { ExportCard } from "@/components/account/export-card";
import { AccountRequestsLog } from "@/components/admin/account-requests-log";
import { CoachReviews } from "@/components/pros/coach-reviews";
import { formerMember } from "@/lib/former-member";
import { normalizeSettingsTab } from "@/lib/settings-dialog-url";

const refresh = vi.fn();
const push = vi.fn();
let pathname = "/dashboard";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ refresh, push }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/observability/client", () => ({ resetIdentity: vi.fn() }));

const fetchMock = vi.fn();

beforeEach(() => {
  pathname = "/dashboard";
  // Unscripted reads (mount effects) answer "not ok" and render nothing.
  fetchMock.mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({}),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fetchMock.mockReset();
});

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const user: MeResponse = {
  id: "u1",
  email: "player@example.com",
  role: Role.Amateur,
  displayName: "Player",
  locale: "en",
  timezone: "UTC",
  emailVerified: true,
  hasPassword: true,
  googleLinked: false,
  avatarUrl: null,
  deletionScheduledFor: null,
};

const noDeletion = {
  scheduledFor: null,
  postponed: false,
  blockers: [],
  reauth: "password",
  graceDays: 14,
};

describe("formerMember", () => {
  it("keeps a name and labels the tombstone", () => {
    expect(formerMember("Anna", "Former member")).toBe("Anna");
    expect(formerMember("", "Former member")).toBe("Former member");
  });

  it("shows a deleted reviewer as Former member with the rating kept", () => {
    wrap(
      <CoachReviews
        proId="p1"
        ratingAvg={4.5}
        ratingCount={2}
        initial={{
          items: [
            {
              id: "r1",
              rating: 4,
              text: "Great drills",
              playerDisplayName: "",
              serviceType: ServiceType.Consultation,
              sessionDate: "2026-09-01T10:00:00.000Z",
              createdAt: "2026-09-02T10:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        }}
      />,
    );
    expect(screen.getByText("Former member")).toBeInTheDocument();
    expect(screen.getByText("Great drills")).toBeInTheDocument();
  });

  it("the settings dialog knows the account tab", () => {
    expect(normalizeSettingsTab("account")).toBe("account");
  });
});

describe("DeleteAccountCard", () => {
  it("lists the blockers with a link and offers no delete action", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        ...noDeletion,
        blockers: [
          {
            kind: "session",
            sessionId: "s1",
            status: SessionStatus.PaidEscrow,
            serviceType: ServiceType.Consultation,
            startsAt: "2026-10-01T10:00:00.000Z",
            role: "coach",
          },
        ],
      }),
    );
    wrap(<DeleteAccountCard user={{ ...user, role: Role.Professional }} />);

    expect(await screen.findByText("Settle these first")).toBeInTheDocument();
    expect(screen.getByText(/you are the coach/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open/ })).toHaveAttribute(
      "href",
      "/dashboard/sessions",
    );
    expect(
      screen.queryByRole("button", { name: "Delete my account" }),
    ).not.toBeInTheDocument();
  });

  it("stays disabled until the confirmation word is typed, then submits", async () => {
    fetchMock.mockResolvedValueOnce(ok(noDeletion));
    wrap(<DeleteAccountCard user={user} />);

    const submit = await screen.findByRole("button", {
      name: "Delete my account",
    });
    fireEvent.change(screen.getByLabelText("Your current password"), {
      target: { value: "secret" },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "delete" },
    });
    expect(submit).toBeEnabled();

    fetchMock.mockResolvedValueOnce(ok({ ...noDeletion, scheduledFor: "x" }));
    fireEvent.click(submit);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/users/me/deletion"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ password: "secret" }),
      }),
    );
  });

  it("asks a Google-only account for an emailed code", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...noDeletion, reauth: "code" }));
    wrap(<DeleteAccountCard user={{ ...user, hasPassword: false }} />);

    const send = await screen.findByRole("button", { name: "Email me a code" });
    fetchMock.mockResolvedValueOnce(ok({ ok: true }));
    fireEvent.click(send);
    await screen.findByText(/We sent a 6-digit code/);
    expect(screen.getByLabelText("Code from the email")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your current password")).toBeNull();
  });

  it("shows a wrong password", async () => {
    fetchMock.mockResolvedValueOnce(ok(noDeletion));
    wrap(<DeleteAccountCard user={user} />);
    fireEvent.change(await screen.findByLabelText("Your current password"), {
      target: { value: "nope" },
    });
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ code: "account_reauth_required" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(
      await screen.findByText("The password or code is not correct."),
    ).toBeInTheDocument();
  });

  it("tells admins to ask another admin", () => {
    wrap(<DeleteAccountCard user={{ ...user, role: Role.Admin }} />);
    expect(
      screen.getByText("Admin accounts are deleted by another admin."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ExportCard", () => {
  it("offers the download while the file exists and names the next request", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        status: AccountDataRequestStatus.Completed,
        requestedAt: "2026-09-18T08:00:00.000Z",
        downloadUrl: "https://storage.test/exports/u1/r1.zip?sig",
        expiresAt: "2026-09-25T08:00:00.000Z",
        nextAllowedAt: "2026-09-19T08:00:00.000Z",
      }),
    );
    wrap(<ExportCard />);
    expect(
      await screen.findByRole("link", { name: /Download zip/ }),
    ).toHaveAttribute("href", "https://storage.test/exports/u1/r1.zip?sig");
    expect(
      screen.getByText(/You can request another export on/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request my data" }),
    ).toBeNull();
  });

  it("requests an export", async () => {
    const empty = {
      status: null,
      requestedAt: null,
      downloadUrl: null,
      expiresAt: null,
      nextAllowedAt: null,
    };
    fetchMock.mockResolvedValueOnce(ok(empty));
    wrap(<ExportCard />);
    const button = await screen.findByRole("button", {
      name: "Request my data",
    });
    await waitFor(() => expect(button).toBeEnabled());
    fetchMock.mockResolvedValueOnce(
      ok({ ...empty, status: AccountDataRequestStatus.Scheduled }),
    );
    fireEvent.click(button);
    expect(
      await screen.findByText(/Your export is being prepared/),
    ).toBeInTheDocument();
  });
});

describe("DeletionGate", () => {
  it("renders nothing without a schedule", () => {
    wrap(<DeletionGate scheduledFor={null} />);
    expect(screen.queryByTestId("deletion-gate")).toBeNull();
  });

  it("offers cancel and export only, and cancels", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/users/me/deletion")
        ? ok({ ...noDeletion, scheduledFor: "2026-10-02T08:00:00.000Z" })
        : ok({
            status: null,
            requestedAt: null,
            downloadUrl: null,
            expiresAt: null,
            nextAllowedAt: null,
          }),
    );
    wrap(<DeletionGate scheduledFor="2026-10-02T08:00:00.000Z" />);
    expect(screen.getByTestId("deletion-gate")).toHaveTextContent(
      "October 2, 2026",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel deletion" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/users/me/deletion"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.getByTestId("export-card")).toBeInTheDocument();
  });

  it("leaves the legal pages readable", () => {
    pathname = "/de/legal/privacy";
    wrap(<DeletionGate scheduledFor="2026-10-02T08:00:00.000Z" />);
    expect(screen.queryByTestId("deletion-gate")).toBeNull();
  });
});

describe("AccountRequestsLog", () => {
  it("shows a failed step and retries it", async () => {
    const failed = {
      id: "r1",
      userId: "3f1c2d4e-0000-4000-8000-000000000000",
      kind: AccountDataRequestKind.Deletion,
      status: AccountDataRequestStatus.Failed,
      initiatedBy: "admin" as const,
      adminId: "a1",
      reason: "request by email",
      requestedAt: "2026-09-18T08:00:00.000Z",
      scheduledFor: "2026-09-18T08:00:00.000Z",
      cancelledAt: null,
      completedAt: null,
      postponedAt: null,
      steps: {
        credentials: { status: "done" as const, at: "x" },
        avatars: { status: "failed" as const, at: "x", error: "storage down" },
      },
      lastError: null,
    };
    wrap(<AccountRequestsLog items={[failed]} />);
    expect(screen.getByText(/storage down/)).toBeInTheDocument();
    expect(screen.getByText(/request by email/)).toBeInTheDocument();
    expect(screen.queryByText(/credentials/)).toBeNull();

    fetchMock.mockResolvedValueOnce(
      ok({
        ...failed,
        status: AccountDataRequestStatus.Completed,
        steps: { ...failed.steps, avatars: { status: "done", at: "y" } },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
