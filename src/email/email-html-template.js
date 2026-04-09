import { LOGO_BASE64 } from './logo-base64.js';

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders a professional HTML email with the Safras & Negocios branding.
 *
 * @param {object} options
 * @param {string} options.subject - Email title displayed in the body
 * @param {string} options.greeting - Greeting line (e.g. "Ola, Fulano.")
 * @param {string[]} options.bodyLines - Array of paragraph strings
 * @param {{ label: string, value: string }} [options.highlight] - Optional highlighted box (code, password)
 * @param {string} [options.footerNote] - Optional note before the footer
 * @returns {string} Complete HTML string
 */
export function renderEmailHtml({ subject, greeting, bodyLines = [], highlight, footerNote }) {
  const paragraphs = bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 12px;color:#444444;font-size:15px;line-height:1.6;">${escapeHtml(line)}</p>`
    )
    .join('\n              ');

  const highlightBlock = highlight
    ? `
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0" style="background:#f0ebe3;border:1.5px solid #d4c5a9;border-radius:10px;padding:18px 28px;text-align:center;">
                      <tr>
                        <td style="font-size:11px;font-weight:600;color:#8B7355;text-transform:uppercase;letter-spacing:1.5px;padding-bottom:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                          ${escapeHtml(highlight.label)}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:28px;font-weight:700;color:#2c2c2c;letter-spacing:4px;font-family:'Courier New',monospace;">
                          ${escapeHtml(highlight.value)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>`
    : '';

  const footerNoteBlock = footerNote
    ? `<p style="margin:16px 0 0;color:#999999;font-size:13px;line-height:1.5;font-style:italic;">${escapeHtml(footerNote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f3ef;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <img src="${LOGO_BASE64}" alt="Safras e Negocios" width="180" style="display:block;max-width:180px;height:auto;border:0;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:12px;padding:32px 28px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

              <!-- Title -->
              <h1 style="margin:0 0 8px;color:#2c2c2c;font-size:20px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                ${escapeHtml(subject)}
              </h1>

              <!-- Greeting -->
              <p style="margin:0 0 20px;color:#666666;font-size:15px;line-height:1.6;">
                ${escapeHtml(greeting)}
              </p>

              <!-- Body -->
              ${paragraphs}

              <!-- Highlight -->
              ${highlightBlock}

              <!-- Footer note -->
              ${footerNoteBlock}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <p style="margin:0;color:#999999;font-size:12px;line-height:1.5;">
                Safras &amp; Negocios
              </p>
              <p style="margin:4px 0 0;color:#bbbbbb;font-size:11px;">
                Este email e automatico. Nao responda diretamente.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
