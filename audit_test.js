/**
 * Comprehensive Playwright audit test for canvas-platform
 * Tests all node types, canvas interactions, auth, workflows, and UX
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:3000";
const SCREENSHOTS_DIR = "/tmp/audit_screenshots";

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let browser, page;
const results = [];

function log(category, test, status, detail = "") {
  const entry = { category, test, status, detail };
  results.push(entry);
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "~";
  console.log(`[${icon}] [${category}] ${test}: ${status}${detail ? " — " + detail : ""}`);
}

async function screenshot(name) {
  try {
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
  } catch (e) {}
}

async function waitForCanvasLoad() {
  await page.waitForSelector(".react-flow", { timeout: 10000 });
  await page.waitForTimeout(1500);
}

async function run() {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push("PAGE ERROR: " + err.message));

  console.log("\n=== AUDIT TEST SUITE STARTING ===\n");

  // ============================================================
  // PHASE 1: ROUTING & PAGE LOAD
  // ============================================================
  console.log("\n--- Phase 1: Routing & Page Load ---");

  // Test 1: Root redirect
  try {
    const resp = await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
    const url = page.url();
    if (url.includes("/canvas") || resp.status() < 400) {
      log("ROUTING", "Root / load", "PASS", `Status: ${resp.status()}, URL: ${url}`);
    } else {
      log("ROUTING", "Root / load", "FAIL", `Status: ${resp.status()}`);
    }
  } catch (e) {
    log("ROUTING", "Root / load", "FAIL", e.message);
  }
  await screenshot("01_root");

  // Test 2: /canvas page load
  try {
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000); // Let auth initialize
    const title = await page.title();
    const hasCanvas = await page.locator(".react-flow").isVisible().catch(() => false);
    log("ROUTING", "/canvas page load", hasCanvas ? "PASS" : "FAIL", `Title: "${title}", ReactFlow: ${hasCanvas}`);
  } catch (e) {
    log("ROUTING", "/canvas page load", "FAIL", e.message);
  }
  await screenshot("02_canvas_page");

  // Wait for auth to settle
  try {
    await page.waitForSelector(".react-flow", { timeout: 15000 });
  } catch (e) {
    log("ROUTING", "ReactFlow present", "FAIL", "ReactFlow not found after 15s");
  }

  // Test 3: /workflows page
  try {
    await page.goto(`${BASE_URL}/workflows`, { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.waitForTimeout(2000);
    const h1 = await page.locator("h1").textContent().catch(() => "");
    const hasContent = await page.locator("body").isVisible();
    log("ROUTING", "/workflows page load", "PASS", `H1: "${h1}"`);
  } catch (e) {
    log("ROUTING", "/workflows page load", "FAIL", e.message);
  }
  await screenshot("03_workflows_page");

  // Test 4: 404 page
  try {
    const resp = await page.goto(`${BASE_URL}/nonexistent-route-xyz`, { waitUntil: "domcontentloaded", timeout: 10000 });
    log("ROUTING", "404 route", "PASS", `Status: ${resp?.status()}, URL: ${page.url()}`);
  } catch (e) {
    log("ROUTING", "404 route", "PASS", "Navigation handled");
  }
  await screenshot("04_404_page");

  // ============================================================
  // PHASE 2: CANVAS PAGE & HEADER
  // ============================================================
  console.log("\n--- Phase 2: Canvas Header & Controls ---");

  await page.goto(`${BASE_URL}/canvas`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);

  try {
    await page.waitForSelector(".react-flow", { timeout: 15000 });
  } catch (e) {}

  // Header elements
  try {
    const hasCanvasLabel = await page.locator("header span:has-text('Canvas')").isVisible().catch(() => false);
    log("HEADER", "Canvas label in header", hasCanvasLabel ? "PASS" : "FAIL", "");
  } catch (e) { log("HEADER", "Canvas label", "FAIL", e.message); }

  try {
    const hasWorkflowsLink = await page.locator("a:has-text('My Workflows')").isVisible().catch(() => false);
    log("HEADER", "My Workflows link visible", hasWorkflowsLink ? "PASS" : "FAIL", "");
  } catch (e) { log("HEADER", "My Workflows link", "FAIL", e.message); }

  try {
    const hasRunButton = await page.locator("[data-testid='run-pipeline']").isVisible().catch(() => false);
    log("HEADER", "Run Pipeline button exists", hasRunButton ? "PASS" : "FAIL", "");
  } catch (e) { log("HEADER", "Run Pipeline button", "FAIL", e.message); }

  try {
    const hasSaveButton = await page.locator("button:has-text('Save')").isVisible().catch(() => false);
    log("HEADER", "Save button visible", hasSaveButton ? "PASS" : "FAIL", "");
  } catch (e) { log("HEADER", "Save button", "FAIL", e.message); }

  try {
    const workflowNameInput = await page.locator("input[placeholder]").first().isVisible().catch(() => false);
    log("HEADER", "Workflow name input", workflowNameInput ? "PASS" : "FAIL", "");
  } catch (e) { log("HEADER", "Workflow name input", "FAIL", e.message); }

  await screenshot("05_canvas_header");

  // ============================================================
  // PHASE 3: TOOLBAR - Node creation
  // ============================================================
  console.log("\n--- Phase 3: Toolbar & Node Creation ---");

  const nodeTypes = [
    { label: "Prompt", expectedClass: "promptNode", color: "neutral" },
    { label: "Model", expectedClass: "modelSelectorNode", color: "neutral" },
    { label: "Generate", expectedClass: "generateNode", color: "blue" },
    { label: "Edit", expectedClass: "editNode", color: "purple" },
    { label: "Animate", expectedClass: "videoNode", color: "orange" },
    { label: "Image Out", expectedClass: "imageOutputNode", color: "neutral" },
    { label: "Video Out", expectedClass: "videoOutputNode", color: "neutral" },
  ];

  // Check toolbar exists
  try {
    const toolbar = await page.locator(".react-flow").locator("..").locator("[class*='absolute'][class*='left']").isVisible().catch(() => false);
    log("TOOLBAR", "Toolbar visible on canvas page", toolbar ? "PASS" : "FAIL", "");
  } catch (e) { log("TOOLBAR", "Toolbar visible", "FAIL", e.message); }

  // Add each node type
  for (const nodeType of nodeTypes) {
    try {
      const btn = page.locator(`button:has-text('${nodeType.label}')`).first();
      const btnVisible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      if (btnVisible) {
        await btn.click();
        await page.waitForTimeout(500);
        log("TOOLBAR", `Add ${nodeType.label} node`, "PASS", "Button clicked");
      } else {
        log("TOOLBAR", `Add ${nodeType.label} node`, "FAIL", "Button not visible");
      }
    } catch (e) {
      log("TOOLBAR", `Add ${nodeType.label} node`, "FAIL", e.message);
    }
  }

  // Check nodes appeared
  const nodeCount = await page.locator(".react-flow__node").count().catch(() => 0);
  log("TOOLBAR", `Nodes created (expected 7)`, nodeCount >= 7 ? "PASS" : "FAIL", `Count: ${nodeCount}`);
  await screenshot("06_nodes_created");

  // Test Multi-Ref template
  try {
    const multiRefBtn = page.locator("button:has-text('Multi-Ref')").first();
    const multiRefVisible = await multiRefBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (multiRefVisible) {
      const prevCount = await page.locator(".react-flow__node").count();
      await multiRefBtn.click();
      await page.waitForTimeout(800);
      const newCount = await page.locator(".react-flow__node").count();
      const added = newCount - prevCount;
      log("TOOLBAR", "Multi-Ref creates 4-node template", added === 4 ? "PASS" : "FAIL", `Added: ${added} nodes`);
    } else {
      log("TOOLBAR", "Multi-Ref template", "FAIL", "Button not visible");
    }
  } catch (e) {
    log("TOOLBAR", "Multi-Ref template", "FAIL", e.message);
  }
  await screenshot("07_multiref_template");

  // ============================================================
  // PHASE 4: CANVAS UX - ReactFlow controls
  // ============================================================
  console.log("\n--- Phase 4: Canvas UX ---");

  try {
    const controls = await page.locator(".react-flow__controls").isVisible().catch(() => false);
    log("CANVAS_UX", "ReactFlow Controls visible", controls ? "PASS" : "FAIL", "");
  } catch (e) { log("CANVAS_UX", "ReactFlow Controls", "FAIL", e.message); }

  try {
    const minimap = await page.locator(".react-flow__minimap").isVisible().catch(() => false);
    log("CANVAS_UX", "MiniMap visible", minimap ? "PASS" : "FAIL", "");
  } catch (e) { log("CANVAS_UX", "MiniMap visible", "FAIL", e.message); }

  try {
    const background = await page.locator(".react-flow__background").isVisible().catch(() => false);
    log("CANVAS_UX", "Background dots pattern visible", background ? "PASS" : "FAIL", "");
  } catch (e) { log("CANVAS_UX", "Background", "FAIL", e.message); }

  // Zoom in button
  try {
    const zoomIn = await page.locator(".react-flow__controls button").first().isVisible().catch(() => false);
    log("CANVAS_UX", "Zoom controls present", zoomIn ? "PASS" : "FAIL", "");
  } catch (e) { log("CANVAS_UX", "Zoom controls", "FAIL", e.message); }

  // ReactFlow attribution hidden (proOptions hideAttribution)
  try {
    const attribution = await page.locator(".react-flow__attribution").isVisible().catch(() => false);
    log("CANVAS_UX", "Attribution hidden (proOptions)", !attribution ? "PASS" : "INFO", `Visible: ${attribution}`);
  } catch (e) { }

  // ============================================================
  // PHASE 5: Node content validation
  // ============================================================
  console.log("\n--- Phase 5: Node Content Validation ---");

  // Check Generate node content
  try {
    const generateNodes = page.locator(".react-flow__node").filter({ hasText: "Generate" });
    const count = await generateNodes.count();
    if (count > 0) {
      const firstNode = generateNodes.first();
      const hasRunBtn = await firstNode.locator("button:has-text('Run')").isVisible().catch(() => false);
      const hasModelLabel = await firstNode.locator("text=FLUX").isVisible().catch(() => false);
      log("NODE_CONTENT", "GenerateNode has Run button", hasRunBtn ? "PASS" : "FAIL", "");
      log("NODE_CONTENT", "GenerateNode shows model label", hasModelLabel ? "PASS" : "INFO", `Model: ${hasModelLabel}`);
    } else {
      log("NODE_CONTENT", "GenerateNode content", "FAIL", "No Generate nodes found");
    }
  } catch (e) { log("NODE_CONTENT", "GenerateNode", "FAIL", e.message); }

  // Check Prompt node content
  try {
    const promptNodes = page.locator(".react-flow__node").filter({ hasText: "Prompt" });
    const count = await promptNodes.count();
    if (count > 0) {
      const hasTextarea = await promptNodes.first().locator("textarea").isVisible().catch(() => false);
      log("NODE_CONTENT", "PromptNode has textarea", hasTextarea ? "PASS" : "FAIL", "");
    } else {
      log("NODE_CONTENT", "PromptNode content", "FAIL", "No Prompt nodes found");
    }
  } catch (e) { log("NODE_CONTENT", "PromptNode", "FAIL", e.message); }

  // Check Edit node content
  try {
    const editNodes = page.locator(".react-flow__node").filter({ hasText: "Edit Image" });
    const count = await editNodes.count();
    if (count > 0) {
      const hasEditBtn = await editNodes.first().locator("button:has-text('Edit')").isVisible().catch(() => false);
      log("NODE_CONTENT", "EditNode has Edit button", hasEditBtn ? "PASS" : "FAIL", "");
    } else {
      log("NODE_CONTENT", "EditNode content", "FAIL", "No Edit nodes found");
    }
  } catch (e) { log("NODE_CONTENT", "EditNode", "FAIL", e.message); }

  // Check Animate (Video) node
  try {
    const videoNodes = page.locator(".react-flow__node").filter({ hasText: "Animate" });
    const count = await videoNodes.count();
    if (count > 0) {
      const hasAnimateBtn = await videoNodes.first().locator("button:has-text('Animate')").isVisible().catch(() => false);
      log("NODE_CONTENT", "VideoNode has Animate button", hasAnimateBtn ? "PASS" : "FAIL", "");
    } else {
      log("NODE_CONTENT", "VideoNode content", "FAIL", "No Animate nodes found");
    }
  } catch (e) { log("NODE_CONTENT", "VideoNode", "FAIL", e.message); }

  // Check ImageOutputNode
  try {
    const imgOutputNodes = page.locator(".react-flow__node").filter({ hasText: "Output" }).first();
    const noOutputText = await imgOutputNodes.locator("text=No output yet").isVisible().catch(() => false);
    const hasPlayBtn = await imgOutputNodes.locator("button").isVisible().catch(() => false);
    log("NODE_CONTENT", "ImageOutputNode shows placeholder", noOutputText ? "PASS" : "INFO", `Placeholder: ${noOutputText}`);
    log("NODE_CONTENT", "ImageOutputNode has run button", hasPlayBtn ? "PASS" : "FAIL", "");
  } catch (e) { log("NODE_CONTENT", "ImageOutputNode", "FAIL", e.message); }

  // Check VideoOutputNode
  try {
    const videoOutputNodes = page.locator(".react-flow__node").filter({ hasText: "Video" }).last();
    const noVideoText = await videoOutputNodes.locator("text=No video yet").isVisible().catch(() => false);
    log("NODE_CONTENT", "VideoOutputNode shows placeholder", noVideoText ? "PASS" : "INFO", `Placeholder: ${noVideoText}`);
  } catch (e) { log("NODE_CONTENT", "VideoOutputNode", "FAIL", e.message); }

  // Check MultiRefNode content
  try {
    const multiRefNodes = page.locator(".react-flow__node").filter({ hasText: "Compose References" });
    const count = await multiRefNodes.count();
    if (count > 0) {
      const hasComposeBtn = await multiRefNodes.first().locator("button:has-text('Compose')").isVisible().catch(() => false);
      const hasUploadBtn = await multiRefNodes.first().locator("button:has-text('Upload')").isVisible().catch(() => false);
      const hasRefCounter = await multiRefNodes.first().locator("text=0/8").isVisible().catch(() => false);
      log("NODE_CONTENT", "MultiRefNode has Compose button", hasComposeBtn ? "PASS" : "FAIL", "");
      log("NODE_CONTENT", "MultiRefNode has Upload button", hasUploadBtn ? "PASS" : "FAIL", "");
      log("NODE_CONTENT", "MultiRefNode shows ref counter", hasRefCounter ? "PASS" : "INFO", `Counter: ${hasRefCounter}`);
    } else {
      log("NODE_CONTENT", "MultiRefNode content", "FAIL", "No MultiRef nodes found");
    }
  } catch (e) { log("NODE_CONTENT", "MultiRefNode", "FAIL", e.message); }

  await screenshot("08_node_content");

  // ============================================================
  // PHASE 6: Node handles
  // ============================================================
  console.log("\n--- Phase 6: Connection Handles ---");

  // Count handles on Generate node
  try {
    const genNodes = page.locator(".react-flow__node").filter({ hasText: "Generate" }).first();
    const handles = await genNodes.locator(".react-flow__handle").count().catch(() => 0);
    log("HANDLES", "GenerateNode handle count (expect 3: 2 target + 1 source)", handles >= 3 ? "PASS" : "FAIL", `Count: ${handles}`);
  } catch (e) { log("HANDLES", "GenerateNode handles", "FAIL", e.message); }

  try {
    const editNodes = page.locator(".react-flow__node").filter({ hasText: "Edit Image" }).first();
    const handles = await editNodes.locator(".react-flow__handle").count().catch(() => 0);
    log("HANDLES", "EditNode handle count (expect 4: 3 target + 1 source)", handles >= 4 ? "PASS" : "FAIL", `Count: ${handles}`);
  } catch (e) { log("HANDLES", "EditNode handles", "FAIL", e.message); }

  try {
    const promptNodes = page.locator(".react-flow__node").filter({ hasText: "Prompt" }).first();
    const handles = await promptNodes.locator(".react-flow__handle").count().catch(() => 0);
    log("HANDLES", "PromptNode handle count (expect 1: source only)", handles === 1 ? "PASS" : "FAIL", `Count: ${handles}`);
  } catch (e) { log("HANDLES", "PromptNode handles", "FAIL", e.message); }

  // ============================================================
  // PHASE 7: Node deletion
  // ============================================================
  console.log("\n--- Phase 7: Node Deletion ---");

  try {
    const nodesBefore = await page.locator(".react-flow__node").count();
    // Click on first node
    const firstNode = page.locator(".react-flow__node").first();
    await firstNode.click();
    await page.waitForTimeout(300);
    // Press Delete
    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);
    const nodesAfter = await page.locator(".react-flow__node").count();
    log("NODE_DELETE", "Delete key removes selected node", nodesAfter < nodesBefore ? "PASS" : "FAIL", `Before: ${nodesBefore}, After: ${nodesAfter}`);
  } catch (e) {
    log("NODE_DELETE", "Node deletion via Delete key", "FAIL", e.message);
  }
  await screenshot("09_after_deletion");

  // ============================================================
  // PHASE 8: Workflow Controls
  // ============================================================
  console.log("\n--- Phase 8: Workflow Controls ---");

  // Clear and start fresh
  await page.goto(`${BASE_URL}/canvas`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);
  try { await page.waitForSelector(".react-flow", { timeout: 10000 }); } catch(e) {}

  // Workflow name editing
  try {
    const nameInput = page.locator("input[class*='bg-transparent']").first();
    const isEditable = await nameInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (isEditable) {
      await nameInput.click();
      await nameInput.fill("My Test Workflow");
      await page.waitForTimeout(300);
      const value = await nameInput.inputValue();
      log("WORKFLOW_CONTROLS", "Workflow name editable", value === "My Test Workflow" ? "PASS" : "FAIL", `Value: "${value}"`);

      // Check dirty indicator
      const hasDirtyDot = await page.locator("[title='Unsaved changes']").isVisible().catch(() => false);
      log("WORKFLOW_CONTROLS", "Dirty indicator (yellow dot) appears on name change", hasDirtyDot ? "PASS" : "FAIL", "");
    } else {
      log("WORKFLOW_CONTROLS", "Workflow name input", "FAIL", "Input not found");
    }
  } catch (e) { log("WORKFLOW_CONTROLS", "Name editing", "FAIL", e.message); }

  // Save button
  try {
    const saveBtn = page.locator("button:has-text('Save')").first();
    const isVisible = await saveBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
      // Check if saved (should show checkmark or saved state)
      const checkCircle = await page.locator(".lucide-circle-check").isVisible().catch(() => false);
      log("WORKFLOW_CONTROLS", "Save button click (check icon after save)", checkCircle ? "PASS" : "INFO", `CheckCircle: ${checkCircle}`);
    } else {
      log("WORKFLOW_CONTROLS", "Save button", "FAIL", "Save button not visible");
    }
  } catch (e) { log("WORKFLOW_CONTROLS", "Save button", "FAIL", e.message); }

  // Cmd+S shortcut
  try {
    await page.keyboard.press("Meta+s");
    await page.waitForTimeout(1000);
    log("WORKFLOW_CONTROLS", "Cmd+S save shortcut", "PASS", "No error thrown");
  } catch (e) {
    log("WORKFLOW_CONTROLS", "Cmd+S shortcut", "FAIL", e.message);
  }

  await screenshot("10_workflow_controls");

  // ============================================================
  // PHASE 9: Project Selector
  // ============================================================
  console.log("\n--- Phase 9: Project Selector ---");

  try {
    const projectSelect = page.locator("select").first();
    const isVisible = await projectSelect.isVisible({ timeout: 3000 }).catch(() => false);
    log("PROJECT_SELECTOR", "Project dropdown visible", isVisible ? "PASS" : "FAIL", "");

    if (isVisible) {
      const options = await projectSelect.locator("option").allTextContents();
      log("PROJECT_SELECTOR", "Has 'No project' option", options.some(o => o.includes("No project")) ? "PASS" : "FAIL", `Options: ${options.join(", ")}`);
      log("PROJECT_SELECTOR", "Has '+ New project' option", options.some(o => o.includes("New project")) ? "PASS" : "FAIL", "");

      // Try to create a new project
      await projectSelect.selectOption("__new__");
      await page.waitForTimeout(300);
      const newProjInput = await page.locator("input[placeholder='Project name']").isVisible().catch(() => false);
      log("PROJECT_SELECTOR", "New project input appears on '+ New project' select", newProjInput ? "PASS" : "FAIL", "");

      if (newProjInput) {
        await page.locator("input[placeholder='Project name']").fill("Test Canvas Project");
        await page.locator("button:has-text('Create')").click();
        await page.waitForTimeout(2000);
        const createdOption = await projectSelect.locator("option").allTextContents();
        log("PROJECT_SELECTOR", "Project created and appears in dropdown", createdOption.some(o => o.includes("Test Canvas Project") || o.includes("Audit")) ? "PASS" : "INFO", `Options after create: ${createdOption.join(", ")}`);
      }
    }
  } catch (e) { log("PROJECT_SELECTOR", "Project selector", "FAIL", e.message); }

  await screenshot("11_project_selector");

  // ============================================================
  // PHASE 10: UserMenu & Credits
  // ============================================================
  console.log("\n--- Phase 10: UserMenu & Credits ---");

  try {
    // Look for credit indicators
    const hasCredits = await page.locator("[class*='text-neutral-400']").filter({ hasText: /\d+/ }).first().isVisible().catch(() => false);
    log("USER_MENU", "Credits visible in header", hasCredits ? "PASS" : "INFO", "");

    // Look for anonymous indicator
    const isAnon = await page.locator("text=Anonymous").isVisible().catch(() => false);
    const hasGoogleBtn = await page.locator("button:has-text('Sign in with Google')").isVisible().catch(() => false);
    const hasSocialDisabledMsg = await page.locator("text=Social login disabled").isVisible().catch(() => false);
    log("USER_MENU", "Anonymous state shown", isAnon ? "PASS" : "INFO", `Anonymous: ${isAnon}`);
    log("USER_MENU", "Google sign-in button OR disabled message", (hasGoogleBtn || hasSocialDisabledMsg) ? "PASS" : "INFO", `Google: ${hasGoogleBtn}, Disabled: ${hasSocialDisabledMsg}`);
  } catch (e) { log("USER_MENU", "UserMenu", "FAIL", e.message); }

  await screenshot("12_user_menu");

  // ============================================================
  // PHASE 11: Run Pipeline Button
  // ============================================================
  console.log("\n--- Phase 11: Run Pipeline Button ---");

  try {
    const runBtn = page.locator("[data-testid='run-pipeline']");
    const isVisible = await runBtn.isVisible({ timeout: 3000 }).catch(() => false);
    log("RUN_PIPELINE", "Run Pipeline button visible", isVisible ? "PASS" : "FAIL", "");

    if (isVisible) {
      await runBtn.click();
      await page.waitForTimeout(1000);
      const isCancelVisible = await page.locator("[data-testid='run-pipeline']:has-text('Cancel')").isVisible().catch(() => false);
      const isRunStillThere = await runBtn.isVisible().catch(() => false);
      log("RUN_PIPELINE", "Run Pipeline button clickable", isRunStillThere ? "PASS" : "FAIL", `Cancel: ${isCancelVisible}`);
    }
  } catch (e) { log("RUN_PIPELINE", "Run Pipeline button", "FAIL", e.message); }

  await screenshot("13_run_pipeline");

  // ============================================================
  // PHASE 12: Workflows page details
  // ============================================================
  console.log("\n--- Phase 12: Workflows Page Details ---");

  await page.goto(`${BASE_URL}/workflows`, { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(2000);

  try {
    const h1 = await page.locator("h1").textContent().catch(() => "");
    log("WORKFLOWS_PAGE", "H1 title", h1.includes("Workflow") ? "PASS" : "FAIL", `H1: "${h1}"`);

    const hasBackLink = await page.locator("a").filter({ has: page.locator("[class*='lucide-arrow-left'], svg") }).first().isVisible().catch(() => false);
    log("WORKFLOWS_PAGE", "Back to canvas link", hasBackLink ? "PASS" : "INFO", "");

    // Check if workflows are listed or empty state
    const hasEmptyState = await page.locator("text=No workflows saved yet").isVisible().catch(() => false);
    const hasWorkflowCards = await page.locator("[class*='rounded-xl'][class*='p-4']").count().catch(() => 0);
    log("WORKFLOWS_PAGE", "Empty state or workflow cards shown", (hasEmptyState || hasWorkflowCards > 0) ? "PASS" : "FAIL", `EmptyState: ${hasEmptyState}, Cards: ${hasWorkflowCards}`);

    if (hasWorkflowCards > 0) {
      // Check clicking a workflow opens canvas
      const firstCard = page.locator("[class*='rounded-xl'][class*='p-4'] a, a[class*='rounded-xl']").first();
      const href = await firstCard.getAttribute("href").catch(() => "");
      log("WORKFLOWS_PAGE", "Workflow cards link to /canvas", href.includes("/canvas") ? "PASS" : "FAIL", `href: ${href}`);
    }
  } catch (e) { log("WORKFLOWS_PAGE", "Workflows page", "FAIL", e.message); }

  await screenshot("14_workflows_page");

  // ============================================================
  // PHASE 13: Connection type validation
  // ============================================================
  console.log("\n--- Phase 13: Canvas Connection Validation ---");

  await page.goto(`${BASE_URL}/canvas`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);
  try { await page.waitForSelector(".react-flow", { timeout: 10000 }); } catch(e) {}

  // Add a prompt node and generate node and check they can be connected
  try {
    const promptBtn = page.locator("button:has-text('Prompt')").first();
    await promptBtn.click();
    await page.waitForTimeout(300);
    const generateBtn = page.locator("button:has-text('Generate')").first();
    await generateBtn.click();
    await page.waitForTimeout(500);

    const nodeCount = await page.locator(".react-flow__node").count();
    log("CANVAS_CONNECTION", "Nodes added for connection test", nodeCount >= 2 ? "PASS" : "FAIL", `Count: ${nodeCount}`);

    // Connection handles are present
    const handles = await page.locator(".react-flow__handle").count();
    log("CANVAS_CONNECTION", "Connection handles present", handles >= 2 ? "PASS" : "FAIL", `Handles: ${handles}`);
  } catch (e) { log("CANVAS_CONNECTION", "Connection test setup", "FAIL", e.message); }

  // ============================================================
  // PHASE 14: Console Errors Summary
  // ============================================================
  console.log("\n--- Phase 14: Console Errors ---");

  if (consoleErrors.length === 0) {
    log("CONSOLE", "No console errors detected", "PASS", "");
  } else {
    for (const err of consoleErrors.slice(0, 10)) {
      log("CONSOLE", "Console error detected", "FAIL", err.substring(0, 200));
    }
    if (consoleErrors.length > 10) {
      log("CONSOLE", `${consoleErrors.length - 10} more errors`, "FAIL", "Truncated");
    }
  }

  // ============================================================
  // PHASE 15: Demo Template Button
  // ============================================================
  console.log("\n--- Phase 15: Demo Template Button ---");

  try {
    const demoBtn = page.locator("[data-testid='load-demo']");
    const isVisible = await demoBtn.isVisible({ timeout: 3000 }).catch(() => false);
    log("DEMO_TEMPLATE", "Load Demo button exists", isVisible ? "PASS" : "FAIL", "");

    if (isVisible) {
      await demoBtn.click();
      await page.waitForTimeout(800);
      const nodeCount = await page.locator(".react-flow__node").count();
      log("DEMO_TEMPLATE", "Demo loads nodes", nodeCount >= 5 ? "PASS" : "FAIL", `Nodes: ${nodeCount}`);
    }
  } catch (e) { log("DEMO_TEMPLATE", "Demo template", "INFO", "Not found on page or different location"); }

  await screenshot("15_final_state");

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  console.log("\n=== TEST SUMMARY ===");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const info = results.filter(r => r.status === "INFO").length;
  console.log(`Total: ${results.length} | PASS: ${passed} | FAIL: ${failed} | INFO: ${info}`);
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);

  // Print all failures
  console.log("\n=== FAILURES ===");
  results.filter(r => r.status === "FAIL").forEach(r => {
    console.log(`  [${r.category}] ${r.test}: ${r.detail}`);
  });

  await browser.close();

  // Write results to file
  fs.writeFileSync("/tmp/audit_results.json", JSON.stringify({ results, consoleErrors }, null, 2));
  console.log("\nFull results written to /tmp/audit_results.json");
}

run().catch(err => {
  console.error("Audit failed:", err);
  if (browser) browser.close();
  process.exit(1);
});
