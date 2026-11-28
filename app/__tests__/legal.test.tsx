import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import PrivacyPolicy from "../routes/privacy-policy";
import TermsOfService from "../routes/terms-of-service";

function renderPage(page: ReactElement) {
  render(<RouterProvider router={createMemoryRouter([{ path: "/", element: page }])} />);
}

describe("legal pages", () => {
  it("names Stripe as the tax year pass payment processor in the privacy policy", () => {
    renderPage(<PrivacyPolicy />);

    expect(screen.getByText(/^Stripe processes tax year pass payments\./)).toHaveTextContent(
      "your account email address"
    );
    expect(screen.getByText(/^Tax year pass purchase information/)).toHaveTextContent(
      "We do not receive or store your card number"
    );
  });

  it("covers tax year passes and refunds in the terms", () => {
    renderPage(<TermsOfService />);

    expect(screen.getByRole("heading", { name: /\. Tax Year Passes$/ })).toBeInTheDocument();
    expect(screen.getByText(/^Refund requests can be sent to/)).toHaveTextContent(
      "If a payment is fully refunded, the tax year pass ends"
    );
    expect(screen.getByText(/^The service relies on third-party services/)).toHaveTextContent(
      "Stripe payment processing"
    );
  });
});
