const pptxgen = require('pptxgenjs');

let pres = new pptxgen();

pres.layout = 'LAYOUT_16x9';

// Base text styles
const titleConfig = { x: 0.5, y: 0.8, w: '90%', fontSize: 36, bold: true, color: '5422FF' };
const bodyConfig = { x: 0.5, y: 1.8, w: '90%', fontSize: 20, color: '363636', bullet: false };
const bulletConfig = { x: 0.5, y: 1.8, w: '90%', fontSize: 20, color: '363636', bullet: true };

// Slide 1: Title
let slide1 = pres.addSlide();
slide1.background = { color: "0A0A0A" };
slide1.addText("EventPro", { x: '10%', y: '35%', w: '80%', fontSize: 54, bold: true, color: 'FFFFFF', align: 'center' });
slide1.addText("The end-to-end OS for premium, enterprise-grade events.", { x: '10%', y: '55%', w: '80%', fontSize: 24, color: 'A8A8A8', align: 'center' });

// Slide 2: The Problem
let slide2 = pres.addSlide();
slide2.addText("1. The Problem", titleConfig);
let probText = "Event management is heavily fragmented.\nOrganizers are forced to duct-tape together 5-6 different platforms to run a single conference:\n\n• Eventbrite for ticketing\n• Mailchimp for marketing\n• Excel for supervisor check-ins\n• Expensive physical hardware for badge printing\n• Third-party B2B apps for exhibitor lead retrieval\n\nThe Result: A clunky attendee experience, lost B2B lead revenue for sponsors, and zero real-time telemetry for event owners.";
slide2.addText(probText, bodyConfig);

// Slide 3: The Solution
let slide3 = pres.addSlide();
slide3.addText("2. The Solution", titleConfig);
let solText = "EventPro is a unified, cloud-backed event ecosystem.\n\nWe replace the fragmented stack with a pristine, centralized suite that provides specialized, real-time portals for every stakeholder involved in an event.\n\nBuilt on a modular React architecture, we focus heavily on First-Class Cinematic UI to elevate the brand experience far beyond generic legacy platforms like Cvent.";
slide3.addText(solText, bodyConfig);

// Slide 4: Market Opportunity
let slide4 = pres.addSlide();
slide4.addText("3. Market Opportunity", titleConfig);
let marketText = "The B2B Event Management Market is exploding.\n\n• TAM (Total Addressable Market): The global events industry is valued at $1.1 Trillion.\n\n• SAM (Serviceable Addressable Market): Event Management Software directly accounts for $14.5 Billion growing at an 11% CAGR.\n\n• Why Now: Post-pandemic, corporate events are demanding higher ROI, better data tracking, and seamless hybrid digital/physical experiences.";
slide4.addText(marketText, bodyConfig);

// Slide 5: The Product Ecosystem
let slide5 = pres.addSlide();
slide5.addText("4. The Product Ecosystem", titleConfig);
let prodText = "We have already developed a fully-functional, interconnected 5-Portal architecture ready for scale:\n\n1. Owner HQ: High-altitude dashboard tracking real-time revenue.\n2. Event Admin Studio: No-code visual engine with Badge Designer.\n3. Supervisor Terminal: Rapid Spot Registration and QR scanning.\n4. Exhibitor Portal: Mobile-first laser scanning tool for lead capture.\n5. Attendee Companion App: Digital pocket-hub with 3D Holographic Tickets, dynamic agendas, and Gamified Digital Swag Bags.";
slide5.addText(prodText, { ...bodyConfig, fontSize: 18 });

// Slide 6: Differentiators
let slide6 = pres.addSlide();
slide6.addText("5. Unfair Advantage & Differentiators", titleConfig);
let diffText = "• Cinematic Experience: We prioritize Glassmorphic aesthetics, 3D physics, and 60fps animations.\n• Zero-Latency Sync: Armed with Firebase Cloud architecture, an attendee checking into the front door instantly updates the metrics on the Owner's iPhone.\n• The 'Live Jumbotron': Ships natively with a massive-screen visualization mode that loops through upcoming speakers and live audience Q&A, eliminating expensive AV graphics teams.";
slide6.addText(diffText, bodyConfig);

// Slide 7: Business Model
let slide7 = pres.addSlide();
slide7.addText("6. Business Model", titleConfig);
let bizText = "We operate on a highly scalable B2B SaaS model with compound revenue streams:\n\nCore SaaS Tiering:\n• Starter: $299 / Event (1 Admin limit)\n• Pro: $999 / Event (Full module suite, custom branding)\n• Enterprise: $12,000 / Year (Unlimited events, dedicated server)\n\nTicketing Commission:\n• 1.5% + $0.99 per paid ticket sold through the platform.";
slide7.addText(bizText, bodyConfig);

// Slide 8: The Ask
let slide8 = pres.addSlide();
slide8.addText("7. The Ask", titleConfig);
let askText = "We are raising Seed Funding ($500k - $750k) to accelerate our Go-To-Market pipeline.\n\nCapital will be primarily allocated toward:\n1. Cloud & Infrastructure Scaling (AWS/Firebase)\n2. Sales & Marketing Targeting Tech Summits\n3. Hardware Integrations (Native print drivers)";
slide8.addText(askText, bodyConfig);

// Save the Presentation
pres.writeFile({ fileName: "EventPro_Pitch_Deck.pptx" }).then(fileName => {
    console.log(`created file: ${fileName}`);
});
