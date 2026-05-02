import * as fs from "fs"
import * as path from "path"
import Handlebars from "handlebars"

// Add environment variable support for the templates path
const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? path.resolve(__dirname, "../../templates")

const cache: Record<string, HandlebarsTemplateDelegate> = {}

interface TemplateData {
  email: string
  name?: string
  [key: string]: unknown
}

interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/**
 * Renders an email template for a contact.
 *
 * Templates live in /templates/{templateId}/
 * Each folder needs three files:
 *   subject.txt  — email subject line
 *   html.hbs     — HTML body
 *   text.hbs     — plain text fallback
 *
 * Variables come from contact properties.
 * e.g. {{name}}, {{plan}} in the template get filled in automatically.
 */
export function renderTemplate(
  templateId: string,
  contact: TemplateData
): RenderedEmail {
  const templateDir = path.join(TEMPLATES_DIR, templateId)

  if (!fs.existsSync(templateDir)) {
    throw new Error(
      `Template '${templateId}' not found at ${templateDir}`
    )
  }

  const render = (filename: string): string => {
    const cacheKey = `${templateId}/${filename}`

    if (!cache[cacheKey]) {
      const src = fs.readFileSync(path.join(templateDir, filename), "utf8")
      cache[cacheKey] = Handlebars.compile(src)
    }

    return cache[cacheKey](contact)
  }

  return {
    subject: render("subject.txt").trim(),
    html:    render("html.hbs"),
    text:    render("text.hbs"),
  }
}