import RssParser from 'rss-parser'
import { dirname, join } from 'path'
import { OpmlParser } from './OpmlParser.js'
import { fileURLToPath } from 'url'
import Email from 'email-templates'
import nodemailer from 'nodemailer'
import { settings } from './LetterSettings.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function run () {
  const opmlFilePath = join(__dirname, '../rss', settings.opmlFile)
  const rssUrls = await new OpmlParser().getFeedUrls(opmlFilePath)
    .catch(error => {
      throw new Error('Problem parsing feeds.opml. Please make sure it conforms to OPML format.'
        + error.message)
    })
  if (rssUrls !== undefined && rssUrls.length > 0) {
    const rssItems = await getRssPostsFromYesterday(rssUrls).catch(error => {
      throw new Error('Problem getting RSS posts: ' + error.message)
    })
    if (rssItems !== undefined && rssItems.length > 0) {
      await sendEmail(rssItems)
      console.log('Good news! Letter just sent you some daily readings. Enjoy.')
    } else {
      console.log('No new readings for today. Sad face.')
    }
  }
}

async function getRssPostsFromYesterday (rssUrls) {
  const rssParser = new RssParser()
  const promises = rssUrls.map(url => rssParser.parseURL(url))
  const successful = (await Promise.allSettled(promises)).filter(
    response => response.status === 'fulfilled')

  return successful.map(response => {
    const feed = response.value
    const items = feed.items.filter(
      feedItem => isFeedItemFromYesterday(new Date(feedItem.isoDate)))
    if (items.length === 0) {
      return undefined
    }
    return {
      ...feed,
      items,
    }
  }).filter(Boolean).sort((a, b) => {
    if (a.title < b.title) {
      return -1
    }
    if (a.title > b.title) {
      return 1
    }
    return 0
  })
}

async function sendEmail (feeds) {
  const mailer = new Email({
    preview: false,
    send: true,
    message: {
      from: settings.email.from,
    },
    transport: nodemailer.createTransport({
      host: settings.smtp.host,
      port: parseInt(settings.smtp.port),
      secure: settings.smtp.secure === 'true',
      auth: {
        user: settings.email.user,
        pass: settings.email.pass,
      },
    }),
    views: {
      options: {
        map: {
          html: 'handlebars',
        },
        extension: 'html',
      },
    },
  })
  return mailer.send({
    template: 'letter',
    message: {
      to: settings.email.to,
    },
    locals: {
      feeds,
      today: (new Date()).toDateString(),
    },
  })
}

function isFeedItemFromYesterday (date) {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return areTwoDatesSame(yesterday, date)
}

function areTwoDatesSame (date, otherDate) {
  return date.getDate() === otherDate.getDate() && date.getMonth() ===
    otherDate.getMonth() && date.getFullYear() === otherDate.getFullYear()
}
