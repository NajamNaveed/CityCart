// Draft policy shells. The copy explains how CityCart intends to operate so the
// pages are useful while the final legal text is being prepared. Every page says
// plainly that it is a draft and not yet an approved agreement.
export const DRAFT_NOTICE =
  'This page is a working draft. It explains how CityCart intends to operate, but it is not legal advice and it is not yet an approved agreement. The final text will replace this draft before launch.'

export const POLICIES = {
  privacy: {
    title: 'Privacy',
    accent: 'policy',
    intro: 'What CityCart collects, why it needs it, who sees it, and the choices you have.',
    sections: [
      {
        id: 'who-we-are',
        heading: 'Who this covers',
        paragraphs: [
          'CityCart is a city-based marketplace. Independent shops sell products through it, and independent professionals offer services. This draft covers the customer website and apps, the seller dashboards, and the support channels that connect them.',
          'Each shop and service provider is its own business. They only receive the customer details needed to fulfil the order or booking you place with them.',
        ],
      },
      {
        id: 'what-we-collect',
        heading: 'What we collect',
        list: [
          'Account details: your name, email address, phone number and password (stored only as a secure hash).',
          'Delivery details: addresses, the map pin for a delivery or service location, and the instructions you add.',
          'Activity: orders, bookings, reviews, price proposals and messages sent through CityCart.',
          'Content you upload: store and profile photos, product images, and photos attached to a report or review.',
          'Technical data needed to keep the service working and secure, such as session cookies, device type and request logs.',
        ],
      },
      {
        id: 'why-we-use-it',
        heading: 'Why we use it',
        list: [
          'To create, secure and recover your account.',
          'To place, deliver and support orders and bookings.',
          'To show the stores and professionals that serve your city and block.',
          'To keep reviews tied to real, completed purchases and jobs.',
          'To detect fraud, abuse and attempts to break the platform rules.',
          'To send service messages about your account, an order or a booking.',
        ],
      },
      {
        id: 'sharing',
        heading: 'Who sees it',
        paragraphs: [
          'The shop or provider fulfilling your order or booking sees the details needed to complete it: your name, contact number, delivery address or service location, and the items or work agreed. A rider assigned to a delivery sees the delivery address and the phone number needed to reach you.',
          'CityCart uses service providers for hosting, media storage and email delivery. They process data on our instructions. We do not sell personal data, and we do not share it for third-party advertising.',
          'We may disclose data where the law requires it, or where it is necessary to investigate fraud, a safety issue or a serious breach of our rules.',
        ],
      },
      {
        id: 'cookies',
        heading: 'Cookies and local storage',
        paragraphs: [
          'CityCart sets a secure, HTTP-only cookie to keep you signed in. The site also remembers small preferences in your browser, such as your chosen city and your cart, so they survive a page reload.',
          'This draft describes only the cookies CityCart sets itself. If analytics or other tools are added later, this section will list them before they are used.',
        ],
      },
      {
        id: 'retention',
        heading: 'How long we keep it',
        paragraphs: [
          'Order, booking and payment records are kept while your account is active and afterwards for as long as accounting, tax and dispute handling require. Messages stay attached to the order or booking they belong to.',
          'You can ask us to delete your account. We will remove or anonymise what we can, but records we are required to keep, or that are needed to resolve an open dispute, may be retained for their required period.',
        ],
      },
      {
        id: 'your-choices',
        heading: 'Your choices',
        list: [
          'Ask for a copy of the personal data linked to your account.',
          'Correct details that are wrong from your account pages, or ask support to help.',
          'Ask for your account to be closed and your data deleted, subject to the retention above.',
          'Choose not to receive non-essential messages. Messages about an active order, booking or account security are still sent.',
        ],
      },
      {
        id: 'changes',
        heading: 'Changes and contact',
        paragraphs: [
          'When the final policy is published it will replace this draft and show the date it takes effect. Material changes will be announced on the site before they apply.',
          'Questions about privacy can go to the support address on the Contact page.',
        ],
      },
    ],
  },

  terms: {
    title: 'Terms',
    accent: 'of use',
    intro: 'The ground rules for using CityCart as a customer, and how the marketplace fits together.',
    sections: [
      {
        id: 'marketplace',
        heading: 'CityCart is a marketplace',
        paragraphs: [
          'CityCart connects customers with independent shops and service providers in their city. The shop or provider is the seller of the product or service, and the contract for that sale is between you and them.',
          'CityCart provides the storefront, the cart, the booking tools and the support that holds the marketplace together. It does not manufacture, inspect or own the products and services listed by sellers.',
        ],
      },
      {
        id: 'accounts',
        heading: 'Your account',
        list: [
          'Give accurate details when you register, and keep them current.',
          'Keep your password and sign-in sessions private. You are responsible for activity on your account.',
          'One person should use one customer account. Seller and provider workspaces are separate from customer accounts.',
          'Tell support immediately if you believe someone else has access to your account.',
        ],
      },
      {
        id: 'orders',
        heading: 'Orders',
        paragraphs: [
          'Placing an order is an offer to the shop. The shop confirms it, prepares it and hands it to a rider. When your cart includes several shops, each shop receives its own separate order and may deliver at a different time.',
          'Stock is checked and reserved when the order is placed, so the same item cannot be sold twice. If a shop cannot fulfil an order, it will contact you through the order to agree what happens next.',
        ],
      },
      {
        id: 'prices-payment',
        heading: 'Prices and payment',
        paragraphs: [
          'Prices are set by the shop and shown in Pakistani rupees. The amount due, including any delivery charge shown at checkout, is confirmed before you place the order.',
          'Payment is cash on delivery. You pay the rider at your door, and the rider records the collection. CityCart does not hold your money and does not process card details.',
        ],
      },
      {
        id: 'services',
        heading: 'Services and bookings',
        paragraphs: [
          'A booking request tells the provider what you need, where and when. The provider can accept it or send a price proposal. The final scope and price are agreed in the booking thread before the work starts.',
          'Service providers are independent professionals. They are responsible for the work they carry out, the tools they use and any licence their trade requires.',
        ],
      },
      {
        id: 'reviews',
        heading: 'Reviews',
        paragraphs: [
          'Reviews can be left after a completed order or booking. They should describe your real experience, be your own words, and stay lawful and respectful.',
          'CityCart may remove reviews that are abusive, contain personal data, or were left to manipulate a rating.',
        ],
      },
      {
        id: 'acceptable-use',
        heading: 'Acceptable use',
        list: [
          'Do not use CityCart for fraud, harassment, or the sale of unlawful or prohibited goods.',
          'Do not attempt to access another account, another shop, or data that does not belong to you.',
          'Do not scrape, overload or probe the service, or try to bypass its security controls.',
          'Do not post content that infringes someone else’s rights.',
        ],
      },
      {
        id: 'suspension',
        heading: 'Suspension and ending use',
        paragraphs: [
          'An account may be limited or suspended where there is fraud, a serious safety concern, repeated breaches of these terms, or a legal requirement to act. Where it is reasonable to do so, we will explain why.',
          'You can stop using CityCart at any time. Open orders and bookings should be settled first.',
        ],
      },
      {
        id: 'liability',
        heading: 'Liability',
        paragraphs: [
          'CityCart works to keep the marketplace available and accurate, but it is provided as it is. CityCart is not a party to the sale between you and a shop or provider.',
          'Nothing in these terms excludes liability that cannot be excluded by law. Where the law gives you consumer rights, those rights continue to apply.',
        ],
      },
      {
        id: 'changes',
        heading: 'Changes and contact',
        paragraphs: [
          'These terms will be replaced by the final published version, which will show the date it takes effect. Material changes will be announced on the site before they apply.',
          'Questions about these terms can go to the support address on the Contact page.',
        ],
      },
    ],
  },

  'refund-policy': {
    title: 'Refund',
    accent: '& returns',
    intro: 'What to do when an order is wrong, damaged or late, and how cash refunds are handled.',
    sections: [
      {
        id: 'cash',
        heading: 'Cash at the door',
        paragraphs: [
          'Orders are paid in cash when they arrive. CityCart does not hold the money and cannot reverse a cash payment on your behalf, so refunds are arranged with the shop that received the payment, with CityCart support helping where needed.',
        ],
      },
      {
        id: 'report',
        heading: 'If something is missing or damaged',
        list: [
          'Report it from the order page as soon as you notice, before using or discarding the item.',
          'Mark the affected items and say what is wrong. Add photos if the damage is visible.',
          'Keep the packaging and the item as they arrived until the shop or support has responded.',
          'The shop reviews the report and agrees a replacement, a refund or another resolution with you.',
        ],
        paragraphs: [
          'If you cannot agree with the shop, contact CityCart support with the order number. Support can review the order record, the delivery record and the conversation.',
        ],
      },
      {
        id: 'cancellations',
        heading: 'Cancelling an order',
        paragraphs: [
          'An order can be cancelled from its page while the cancel option is shown. Once the shop has accepted and started preparing it, contact the shop through the order so the cancellation can be agreed between you.',
          'If a cancellation is agreed, any cash already collected is returned by the shop. CityCart support can help record what was agreed.',
        ],
      },
      {
        id: 'services',
        heading: 'Service bookings',
        paragraphs: [
          'Service work is agreed and paid directly between you and the provider. Cancellation terms, including any visit fee, should be agreed in the booking chat before work starts.',
          'If work is incomplete, different from what was agreed, or causes damage, report it through the booking and contact support with the details. Keep the conversation and any photos in the booking thread.',
        ],
      },
      {
        id: 'not-covered',
        heading: 'What this draft does not cover',
        list: [
          'A change of mind after you have accepted an item that arrived as described.',
          'Damage caused after delivery, or items altered or used after receipt.',
          'An agreement you made with a seller outside the CityCart order or booking.',
        ],
      },
      {
        id: 'timing',
        heading: 'Timing',
        paragraphs: [
          'Report a problem as soon as you can. A shop may be unable to investigate a claim long after the order was delivered, and cash refunds depend on the shop and the payment record.',
          'The final version of this policy will set out exact reporting windows and refund timelines. Until then, support will confirm what applies to your case.',
        ],
      },
      {
        id: 'contact',
        heading: 'Contact',
        paragraphs: [
          'Use the support address on the Contact page and include the order or booking number. Never send passwords, one-time codes or full card numbers.',
        ],
      },
    ],
  },

  'seller-agreement': {
    title: 'Seller',
    accent: 'agreement',
    intro: 'What it means to run a shop on CityCart: listings, orders, cash and commission.',
    sections: [
      {
        id: 'opening',
        heading: 'Opening a store',
        paragraphs: [
          'A shop starts with the application at Sell on CityCart. After the owner verifies their email, the brand gets a storefront and a first shop. Additional staff can be invited with permissions chosen by the brand owner.',
          'Each brand is separate. Staff of one brand cannot see or change another brand’s products, orders, stock or messages.',
        ],
      },
      {
        id: 'listings',
        heading: 'Your listings',
        list: [
          'Describe products accurately: name, price, stock, size, condition and photos of the actual item.',
          'Only list goods you are allowed to sell, and keep the required licences for your trade.',
          'Keep stock current. Reserved stock is held for an order as soon as it is placed.',
          'Do not use another brand’s photos, names or descriptions without permission.',
        ],
      },
      {
        id: 'orders',
        heading: 'Orders and fulfilment',
        paragraphs: [
          'Every order belongs to exactly one brand. When a customer shops several brands at once, each brand receives its own order and is responsible for its own items.',
          'Confirm or decline an order promptly, prepare it as described, and hand it to the assigned rider. Keep the order status current so the customer and the delivery team see the same picture.',
        ],
      },
      {
        id: 'cash',
        heading: 'Cash and customer refunds',
        paragraphs: [
          'Customers pay in cash at the door, and the shop receives that money. CityCart does not hold it and does not run an escrow.',
          'If an item is missing or damaged, work with the customer from the order page. Cash refunds and replacements are settled between the shop and the customer, with support available to mediate.',
        ],
      },
      {
        id: 'commission',
        heading: 'Commission and billing',
        paragraphs: [
          'CityCart charges a commission on completed sales. The rate that applies to your account is shown in Billing, and completed sales are collected into a monthly invoice.',
          'Keep the invoice details current. If an invoice remains unpaid, CityCart may restrict new orders until the account is settled, as described in the billing screens.',
        ],
      },
      {
        id: 'data',
        heading: 'Customer data',
        paragraphs: [
          'Use the customer details you receive only to fulfil the order they belong to: delivery, contact about that order, and returns. Do not add customers to unrelated marketing lists or share their details with anyone who is not involved in the order.',
        ],
      },
      {
        id: 'conduct',
        heading: 'Conduct and suspension',
        paragraphs: [
          'Counterfeit or prohibited goods, repeated cancellations, fraudulent claims, or attempts to move customers off the platform to avoid commission are breaches of this agreement.',
          'CityCart may pause a shop while a serious issue is investigated, or suspend it where the breach continues.',
        ],
      },
      {
        id: 'changes',
        heading: 'Changes and contact',
        paragraphs: [
          'The final published version of this agreement will replace this draft and show the date it takes effect. Changes that affect commission or billing will be announced before they apply.',
          'Questions about selling can go to the support address on the Contact page.',
        ],
      },
    ],
  },

  'provider-agreement': {
    title: 'Provider',
    accent: 'agreement',
    intro: 'What it means to offer a service on CityCart: your profile, bookings, cash and commission.',
    sections: [
      {
        id: 'joining',
        heading: 'Becoming a provider',
        paragraphs: [
          'Service providers apply with a service name, a category, a starting price and the block they work in. Applications are reviewed by the CityCart team before the profile appears to customers.',
          'A provider profile is separate from a customer account and from a shop. It belongs to the person or business that applied and cannot be transferred without CityCart’s agreement.',
        ],
      },
      {
        id: 'profile',
        heading: 'Your profile and prices',
        list: [
          'Keep your service description, category, block and starting price accurate.',
          'Use photos that show your real work or your team.',
          'Keep your availability current so customers only request slots you can work.',
          'Keep your contact and payout details up to date.',
        ],
      },
      {
        id: 'bookings',
        heading: 'Bookings and proposals',
        paragraphs: [
          'A booking request is not a confirmed job until you accept it. You may accept the request or send a price proposal; the customer can accept, decline or reply in the booking chat.',
          'Agree the scope, price and timing in the thread before the visit. Arrive when agreed, and tell the customer through the booking if something changes. Mark the job complete only when the work is done.',
        ],
      },
      {
        id: 'cash',
        heading: 'Payment for your work',
        paragraphs: [
          'Customers pay you directly for the work you carry out. CityCart does not hold the money, does not run an escrow and does not process card details.',
          'Any refund, discount or additional charge for a job is agreed between you and the customer, with support available if you cannot agree.',
        ],
      },
      {
        id: 'commission',
        heading: 'Commission and billing',
        paragraphs: [
          'CityCart charges a commission on completed bookings. The rate that applies to your account is shown in Billing, and completed work is collected into a monthly invoice.',
          'Keep your billing details current. If an invoice remains unpaid, CityCart may restrict new bookings until the account is settled.',
        ],
      },
      {
        id: 'reviews',
        heading: 'Reviews',
        paragraphs: [
          'Customers can review a completed booking. Do not ask for reviews in exchange for a discount, write reviews for your own profile, or pressure a customer to change an honest review.',
        ],
      },
      {
        id: 'safety',
        heading: 'Safety and conduct',
        paragraphs: [
          'Carry out work lawfully, safely and to the standard your trade requires, including any licence or insurance. Treat customers and their property with care, and do not harass, threaten or discriminate against anyone.',
          'CityCart may remove a profile or pause it while a safety concern, fraud or a serious breach is investigated.',
        ],
      },
      {
        id: 'changes',
        heading: 'Changes and contact',
        paragraphs: [
          'The final published version of this agreement will replace this draft and show the date it takes effect. Changes that affect commission or billing will be announced before they apply.',
          'Questions about offering services can go to the support address on the Contact page.',
        ],
      },
    ],
  },
}

export const POLICY_LINKS = [
  { key: 'privacy', to: '/privacy', label: 'Privacy policy' },
  { key: 'terms', to: '/terms', label: 'Terms of use' },
  { key: 'refund-policy', to: '/refund-policy', label: 'Refund & returns' },
  { key: 'seller-agreement', to: '/seller-agreement', label: 'Seller agreement' },
  { key: 'provider-agreement', to: '/provider-agreement', label: 'Provider agreement' },
]
