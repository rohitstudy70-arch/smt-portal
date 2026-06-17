const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'src', 'components', 'InvoiceGenerator', 'InvoiceGenerator.jsx');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('invoice') || line.toLowerCase().includes('download') || line.toLowerCase().includes('pdf') || line.toLowerCase().includes('print')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
