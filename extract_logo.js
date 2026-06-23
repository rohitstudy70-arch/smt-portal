const fs = require('fs');
const html = fs.readFileSync('Arshi_GPS_Invoice_Website (1).html', 'utf8');
const match = html.match(/src="(data:image\/png;base64,[^"]*)"/);
if (match) {
  const content = `export const INVOICE_LOGO = '${match[1]}';\n`;
  fs.writeFileSync('frontend/src/utils/invoiceLogo.js', content);
  console.log('Logo extracted successfully to frontend/src/utils/invoiceLogo.js');
} else {
  console.log('No base64 logo found.');
}
