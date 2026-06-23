# Implement New Invoice Template

## Goal
The goal is to update the Invoice Generator and Proforma Invoice pages to use the newly provided HTML invoice template (`Arshi_GPS_Invoice_Website (1).html`). This primarily includes adding the new Arshi GPS logo (base64 image) to the invoice headers, and ensuring the "Bank Details" and other layout elements perfectly match the provided design.

## Proposed Changes

### 1. Extract the Logo
- Create a new file `frontend/src/utils/invoiceLogo.js`.
- Extract the base64 string from the uploaded `Arshi_GPS_Invoice_Website (1).html` and store it as a constant in this file. This prevents cluttering the React components with a massive 500KB+ base64 string.

### 2. Update `InvoiceGenerator.jsx`
- Import the base64 logo constant.
- Update the `handleDownloadInvoice` HTML generation string to include the `<img src="${LOGO_BASE64}" ...>` tag in the header, matching the provided template.

### 3. Update `ProformaInvoice.jsx`
- Import the base64 logo constant.
- Update the `downloadHTML` function to include the logo in the header and also add the missing "Bank Details" section that is present in the new HTML design.
- Update the React component layout (`<div className="proforma-header">`) to display the logo image in the UI as well.

> [!NOTE]
> The Bank Details fields currently have blank placeholders (`_________`). I will leave them as placeholders so you can manually fill them, exactly as shown in your HTML file.

## Verification Plan
- I will verify that clicking "Download Invoice" on the Invoice Generator page opens the new popup with the logo correctly rendered.
- I will verify that the Proforma Invoice page displays the logo correctly in both the UI and the downloaded HTML.
