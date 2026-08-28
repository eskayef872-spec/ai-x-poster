"use strict";

// ============================================================
// AI X POSTER
// Cloudflare Worker
// ============================================================

const TEXT_MODEL =
    "@cf/zai-org/glm-4.7-flash";

const IMAGE_MODEL =
    "@cf/black-forest-labs/flux-1-schnell";

const MAX_TOPIC_LENGTH = 500;
const MAX_X_LENGTH = 280;

// ApiTweet safety delay
const APITWEET_MIN_DELAY = 10000;

// Maximum automatic retries after rate-limit
const APITWEET_MAX_RETRIES = 3;


// ============================================================
// WORKER
// ============================================================

export default {

    async fetch(request, env) {

        const url =
            new URL(request.url);


        // ----------------------------------------------------
        // CORS
        // ----------------------------------------------------

        if (
            request.method === "OPTIONS"
        ) {

            return new Response(
                null,
                {
                    status: 204,
                    headers: corsHeaders()
                }
            );

        }


        // ----------------------------------------------------
        // HEALTH
        // ----------------------------------------------------

        if (
            url.pathname === "/api/health" &&
            request.method === "GET"
        ) {

            return json({

                success: true,

                service:
                    "AI X Poster",

                ai:
                    !!env.AI,

                imgbb:
                    !!env.IMGBB_API_KEY,

                apitweet:
                    !!env.APITWEET_API_KEY &&
                    !!env.APITWEET_AUTH_TOKEN,

                timestamp:
                    new Date().toISOString()

            });

        }


        // ----------------------------------------------------
        // TEST AI
        // ----------------------------------------------------

        if (
            url.pathname === "/api/test-ai" &&
            request.method === "GET"
        ) {

            return testAI(env);

        }


        // ----------------------------------------------------
        // TEST IMGBB
        // ----------------------------------------------------

        if (
            url.pathname === "/api/test-imgbb" &&
            request.method === "POST"
        ) {

            return testImgBB(env);

        }


        // ----------------------------------------------------
        // TEST APITWEET
        // ----------------------------------------------------

        if (
            url.pathname === "/api/test-apitweet" &&
            request.method === "GET"
        ) {

            return testApiTweet(env);

        }


        // ----------------------------------------------------
        // GENERATE FULL CONTENT
        // ----------------------------------------------------

        if (
            url.pathname === "/api/generate" &&
            request.method === "POST"
        ) {

            return generatePost(
                request,
                env
            );

        }


        // ----------------------------------------------------
        // GENERATE CAPTION
        // ----------------------------------------------------

        if (
            url.pathname === "/api/generate-caption" &&
            request.method === "POST"
        ) {

            return generateCaptionEndpoint(
                request,
                env
            );

        }


        // ----------------------------------------------------
        // GENERATE IMAGE
        // ----------------------------------------------------

        if (
            url.pathname === "/api/generate-image" &&
            request.method === "POST"
        ) {

            return generateImageEndpoint(
                request,
                env
            );

        }


        // ----------------------------------------------------
        // POST TO X
        // ----------------------------------------------------

        if (
            url.pathname === "/api/post" &&
            request.method === "POST"
        ) {

            return postToX(
                request,
                env
            );

        }


        // ----------------------------------------------------
        // ASSETS
        // ----------------------------------------------------

        if (env.ASSETS) {

            return env.ASSETS.fetch(
                request
            );

        }


        return new Response(
            "AI X Poster",
            {
                status: 200,
                headers: corsHeaders()
            }
        );

    }

};


// ============================================================
// TEST AI
// ============================================================

async function testAI(env) {

    if (!env.AI) {

        return json({

            success: false,

            error:
                "Workers AI binding is missing."

        }, 500);

    }


    try {

        const result =
            await env.AI.run(
                TEXT_MODEL,
                {

                    messages: [

                        {
                            role: "system",

                            content:
                                "You are an X/Twitter copywriter. Return only one final publishable X post. Never return reasoning, analysis, drafts, ideas, or explanations."
                        },

                        {
                            role: "user",

                            content:
                                "Write one short X post about Android 16. Include exactly 2 hashtags. Maximum 280 characters."
                        }

                    ],

                    max_completion_tokens:
                        500,

                    temperature:
                        0.7

                }
            );


        let text =
            extractText(result);


        text =
            cleanCaption(text);


        if (
            !isValidCaption(text)
        ) {

            text =
                extractPostFromReasoning(
                    result?.choices?.[0]?.message?.reasoning ||
                    result?.choices?.[0]?.message?.reasoning_content ||
                    ""
                );

        }


        return json({

            success: true,

            model:
                TEXT_MODEL,

            text,

            character_count:
                text.length,

            within_limit:
                text.length <= MAX_X_LENGTH,

            raw:
                result

        });


    } catch (error) {

        return errorResponse(
            "AI test failed.",
            error
        );

    }

}


// ============================================================
// GENERATE FULL POST
// ============================================================

async function generatePost(
    request,
    env
) {

    if (!env.AI) {

        return json({

            success: false,

            error:
                "Workers AI binding is missing."

        }, 500);

    }


    let body;


    try {

        body =
            await request.json();

    } catch {

        return json({

            success: false,

            error:
                "Invalid JSON request."

        }, 400);

    }


    const topic =
        String(
            body?.topic || ""
        ).trim();


    if (!topic) {

        return json({

            success: false,

            error:
                "Topic is required."

        }, 400);

    }


    if (
        topic.length >
        MAX_TOPIC_LENGTH
    ) {

        return json({

            success: false,

            error:
                `Topic must be ${MAX_TOPIC_LENGTH} characters or less.`

        }, 400);

    }


    // --------------------------------------------------------
    // CAPTION
    // --------------------------------------------------------

    let caption;


    try {

        caption =
            await createCaption(
                env,
                topic
            );

    } catch (error) {

        return errorResponse(
            "Caption generation failed.",
            error
        );

    }


    // --------------------------------------------------------
    // IMAGE
    // --------------------------------------------------------

    let image = null;
    let imageError = null;


    try {

        image =
            await createImage(
                env,
                topic
            );

    } catch (error) {

        console.error(
            "IMAGE ERROR:",
            error
        );

        imageError =
            error?.message ||
            String(error);

    }


    // --------------------------------------------------------
    // IMGBB
    // --------------------------------------------------------

    let imageUrl = null;
    let imageUploadError = null;


    if (
        image?.base64
    ) {

        try {

            imageUrl =
                await uploadImageToImgBB(
                    env,
                    image.base64
                );

        } catch (error) {

            console.error(
                "IMGBB ERROR:",
                error
            );

            imageUploadError =
                error?.message ||
                String(error);

        }

    }


    return json({

        success: true,

        caption,

        character_count:
            caption.length,

        within_limit:
            caption.length <= MAX_X_LENGTH,

        image:
            image?.base64 ||
            null,

        image_type:
            image?.contentType ||
            null,

        image_generated:
            !!image,

        image_error:
            imageError,

        image_url:
            imageUrl,

        image_upload_error:
            imageUploadError

    });

}


// ============================================================
// CREATE CAPTION
// ============================================================

async function createCaption(
    env,
    topic
) {

    const prompt = `

Write ONE ready-to-publish X/Twitter post about:

${topic}

Rules:

- Maximum 280 characters.
- Include 2 or 3 relevant hashtags.
- Make it engaging.
- Natural human writing.
- No title.
- No explanation.
- No quotation marks.
- No multiple versions.
- No draft labels.
- No idea labels.
- No analysis.
- No reasoning.
- No "Final:" prefix.
- Return ONLY the final post.

IMPORTANT:

Do not show your thinking.
Do not show drafts.
Do not show ideas.
Do not explain anything.

ONLY output the final X post.

`;


    const result =
        await env.AI.run(
            TEXT_MODEL,
            {

                messages: [

                    {
                        role: "system",

                        content:
                            "You are an expert X/Twitter copywriter. Output ONLY one final publishable X post. Never output reasoning, analysis, drafts, ideas, critiques, or explanations."
                    },

                    {
                        role: "user",

                        content:
                            prompt
                    }

                ],

                max_completion_tokens:
                    500,

                temperature:
                    0.7

            }
        );


    // --------------------------------------------------------
    // Try normal content first
    // --------------------------------------------------------

    let caption =
        cleanCaption(
            extractTextWithoutReasoning(
                result
            )
        );


    // --------------------------------------------------------
    // If normal content is invalid,
    // extract actual post from reasoning
    // --------------------------------------------------------

    if (
        !isValidCaption(caption)
    ) {

        caption =
            extractPostFromReasoning(
                result?.choices?.[0]?.message?.reasoning ||
                result?.choices?.[0]?.message?.reasoning_content ||
                ""
            );

    }


    // --------------------------------------------------------
    // Final validation
    // --------------------------------------------------------

    if (
        !isValidCaption(caption)
    ) {

        throw new Error(
            "AI did not return a valid X post."
        );

    }


    // --------------------------------------------------------
    // Safety shortening
    // --------------------------------------------------------

    if (
        caption.length >
        MAX_X_LENGTH
    ) {

        caption =
            await shortenCaption(
                env,
                caption
            );

    }


    if (
        caption.length >
        MAX_X_LENGTH
    ) {

        caption =
            hardTrim(
                caption,
                MAX_X_LENGTH
            );

    }


    if (
        !caption ||
        caption.length >
            MAX_X_LENGTH
    ) {

        throw new Error(
            "Unable to create a valid caption within 280 characters."
        );

    }


    return caption;

}


// ============================================================
// EXTRACT TEXT WITHOUT REASONING
// ============================================================

function extractTextWithoutReasoning(
    result
) {

    if (!result) {

        return "";

    }


    if (
        typeof result.response ===
        "string"
    ) {

        return result.response;

    }


    if (
        Array.isArray(
            result.choices
        ) &&
        result.choices.length
    ) {

        const message =
            result.choices[0]?.message;


        if (
            typeof message?.content ===
            "string"
        ) {

            return message.content;

        }


        if (
            Array.isArray(
                message?.content
            )
        ) {

            return message.content
                .map(item => {

                    if (
                        typeof item ===
                        "string"
                    ) {

                        return item;

                    }

                    return (
                        item?.text ||
                        ""
                    );

                })
                .join("");

        }

    }


    return "";

}


// ============================================================
// EXTRACT TEXT
// ============================================================

function extractText(
    result
) {

    const normal =
        extractTextWithoutReasoning(
            result
        );


    if (normal) {

        return normal;

    }


    if (
        result?.choices?.[0]?.message?.reasoning
    ) {

        return extractPostFromReasoning(
            result.choices[0].message.reasoning
        );

    }


    if (
        result?.choices?.[0]?.message?.reasoning_content
    ) {

        return extractPostFromReasoning(
            result.choices[0].message.reasoning_content
        );

    }


    return "";

}


// ============================================================
// EXTRACT POST FROM REASONING
// ============================================================

function extractPostFromReasoning(
    reasoning
) {

    if (!reasoning) {

        return "";

    }


    const text =
        String(
            reasoning
        ).trim();


    // --------------------------------------------------------
    // 1. Quoted candidate search
    // --------------------------------------------------------

    const quotedMatches = [
        ...text.matchAll(
            /["“]([^"”\n]{10,280})["”]/g
        )
    ];


    for (
        let i =
            quotedMatches.length - 1;

        i >= 0;

        i--
    ) {

        let candidate =
            cleanCaption(
                quotedMatches[i][1]
            );


        if (
            isValidCaption(candidate)
        ) {

            return candidate;

        }

    }


    // --------------------------------------------------------
    // 2. Line-by-line search
    // --------------------------------------------------------

    const lines =
        text
            .split("\n")
            .map(
                line =>
                    line.trim()
            )
            .filter(Boolean);


    const candidates = [];


    for (
        const originalLine of lines
    ) {

        let line =
            originalLine;


        // Remove markdown formatting
        line =
            line
                .replace(
                    /^\*+\s*/,
                    ""
                )
                .replace(
                    /\s*\*+$/,
                    ""
                )
                .trim();


        // Remove Draft / Idea prefix
        line =
            line.replace(
                /^(?:draft|idea)\s*\d+\s*:\s*/i,
                ""
            )
            .trim();


        // Remove Draft / Idea Check prefix
        line =
            line.replace(
                /^(?:draft|idea)\s*\d+\s*(?:check|final)?\s*:\s*/i,
                ""
            )
            .trim();


        // Remove Final / Answer / Post
        line =
            line.replace(
                /^(?:final\s*(?:answer|post)?|answer|post)\s*:\s*/i,
                ""
            )
            .trim();


        // Remove numbered list
        line =
            line.replace(
                /^\d+\.\s+/,
                ""
            )
            .trim();


        // Remove markdown bold markers
        line =
            line
                .replace(
                    /^\*+/,
                    ""
                )
                .replace(
                    /\*+$/,
                    ""
                )
                .trim();


        const candidate =
            cleanCaption(
                line
            );


        // Must contain hashtag
        if (
            !/#([A-Za-z0-9_]+)/.test(
                candidate
            )
        ) {

            continue;

        }


        // Must not be reasoning
        if (
            isReasoningLine(
                candidate
            )
        ) {

            continue;

        }


        // Must be valid X post
        if (
            isValidCaption(
                candidate
            )
        ) {

            candidates.push(
                candidate
            );

        }

    }


    // --------------------------------------------------------
    // 3. Last valid candidate
    // --------------------------------------------------------

    if (
        candidates.length
    ) {

        return candidates[
            candidates.length - 1
        ];

    }


    // --------------------------------------------------------
    // 4. Search whole reasoning for quoted-like
    //    hashtag sentence
    // --------------------------------------------------------

    const hashtagSentences =
        text.match(
            /[^.!?\n]{10,280}#[A-Za-z0-9_]+(?:\s+#[A-Za-z0-9_]+)*[^.!?\n]*/g
        );


    if (
        hashtagSentences
    ) {

        for (
            let i =
                hashtagSentences.length - 1;

            i >= 0;

            i--
        ) {

            const candidate =
                cleanCaption(
                    hashtagSentences[i]
                );


            if (
                isValidCaption(
                    candidate
                )
            ) {

                return candidate;

            }

        }

    }


    return "";

}


// ============================================================
// CHECK REASONING LINE
// ============================================================

function isReasoningLine(
    text
) {

    const value =
        String(
            text || ""
        )
        .trim();


    if (!value) {

        return true;

    }


    const patterns = [

        /^analyze\b/i,

        /^analysis\b/i,

        /^analyzing\b/i,

        /^drafting\b/i,

        /^draft\b/i,

        /^refining\b/i,

        /^refinement\b/i,

        /^constraints?\b/i,

        /^critique\b/i,

        /^reasoning\b/i,

        /^finalizing\b/i,

        /^key themes?\b/i,

        /^determine\b/i,

        /^determine key\b/i,

        /^idea\s+\d+/i,

        /^draft\s+\d+/i,

        /^\d+\.\s*\*{0,2}(?:analyze|analysis|drafting|refining|constraints|critique|final)/i,

        /^\*{0,2}(?:analyze|analysis|drafting|refining|constraints|critique|final)/i,

        /^good length\b/i,

        /^characters?\s*:/i,

        /^the user\b/i,

        /^the request\b/i

    ];


    return patterns.some(
        pattern =>
            pattern.test(value)
    );

}


// ============================================================
// VALIDATE CAPTION
// ============================================================

function isValidCaption(
    text
) {

    if (!text) {

        return false;

    }


    const value =
        String(
            text
        ).trim();


    // Minimum reasonable length
    if (
        value.length < 10
    ) {

        return false;

    }


    // X limit
    if (
        value.length >
        MAX_X_LENGTH
    ) {

        return false;

    }


    // Must have hashtag
    if (
        !/#([A-Za-z0-9_]+)/.test(
            value
        )
    ) {

        return false;

    }


    // Reject reasoning
    if (
        isReasoningLine(
            value
        )
    ) {

        return false;

    }


    // Reject unfinished markdown
    if (
        value.endsWith("*") ||
        value.endsWith(":")
    ) {

        return false;

    }


    // Reject obvious numbered reasoning
    if (
        /^\d+\.\s*\*{1,2}/.test(
            value
        )
    ) {

        return false;

    }


    // Reject analysis fragments
    if (
        /\b(?:refining|drafting|critique|analysis|reasoning)\b/i
            .test(value)
    ) {

        return false;

    }


    return true;

}


// ============================================================
// CLEAN CAPTION
// ============================================================

function cleanCaption(
    text
) {

    if (!text) {

        return "";

    }


    let value =
        String(
            text
        ).trim();


    // Remove code fences
    value =
        value
            .replace(
                /^```[\w-]*\s*/i,
                ""
            )
            .replace(
                /\s*```$/i,
                ""
            )
            .trim();


    // Remove Text / Final / Answer / Post prefixes
    value =
        value.replace(
            /^(?:text|final\s*(?:answer|post)?|answer|post)\s*:\s*/i,
            ""
        )
        .trim();


    // Remove Draft / Idea prefixes
    value =
        value.replace(
            /^(?:\*+)?\s*(?:draft|idea)\s*\d+\s*:\s*(?:\*+)?\s*/i,
            ""
        )
        .trim();


    // Remove Draft / Idea Check prefixes
    value =
        value.replace(
            /^(?:\*+)?\s*(?:draft|idea)\s*\d+\s*(?:check|final)?\s*:\s*(?:\*+)?\s*/i,
            ""
        )
        .trim();


    // Remove leading number
    value =
        value.replace(
            /^\d+\.\s+/,
            ""
        )
        .trim();


    // Remove surrounding quotation marks
    if (
        (
            value.startsWith('"') &&
            value.endsWith('"')
        ) ||
        (
            value.startsWith("'") &&
            value.endsWith("'")
        ) ||
        (
            value.startsWith("“") &&
            value.endsWith("”")
        )
    ) {

        value =
            value.substring(
                1,
                value.length - 1
            ).trim();

    }


    // Remove surrounding markdown stars
    value =
        value
            .replace(
                /^\*+\s*/,
                ""
            )
            .replace(
                /\s*\*+$/,
                ""
            )
            .trim();


    // Normalize whitespace
    value =
        value
            .replace(
                /\s+/g,
                " "
            )
            .trim();


    return value;

}


// ============================================================
// SHORTEN CAPTION
// ============================================================

async function shortenCaption(
    env,
    caption
) {

    const result =
        await env.AI.run(
            TEXT_MODEL,
            {

                messages: [

                    {
                        role: "system",

                        content:
                            "Return ONLY one final X post. No reasoning. No explanation. No drafts."
                    },

                    {
                        role: "user",

                        content: `

Shorten this X post to 280 characters or less.

Keep the main meaning.

Keep 2 or 3 relevant hashtags.

Return ONLY the final post.

${caption}

`
                    }

                ],

                max_completion_tokens:
                    350,

                temperature:
                    0.3

            }
        );


    let resultText =
        cleanCaption(
            extractTextWithoutReasoning(
                result
            )
        );


    if (
        !isValidCaption(
            resultText
        )
    ) {

        resultText =
            extractPostFromReasoning(
                result?.choices?.[0]?.message?.reasoning ||
                result?.choices?.[0]?.message?.reasoning_content ||
                ""
            );

    }


    return resultText;

}


// ============================================================
// HARD TRIM
// ============================================================

function hardTrim(
    text,
    maxLength
) {

    if (
        text.length <=
        maxLength
    ) {

        return text;

    }


    let result =
        text.substring(
            0,
            maxLength
        );


    const lastSpace =
        result.lastIndexOf(
            " "
        );


    if (
        lastSpace > 150
    ) {

        result =
            result.substring(
                0,
                lastSpace
            );

    }


    return result.trim();

}


// ============================================================
// CREATE IMAGE
// ============================================================

async function createImage(
    env,
    topic
) {

    if (!env.AI) {

        throw new Error(
            "Workers AI binding is missing."
        );

    }


    const prompt = `

Create a professional high-quality social media image about:

${topic}

Visual requirements:

- Modern
- Eye-catching
- Professional
- Strong composition
- High visual quality
- Suitable for X/Twitter
- Clearly communicate the topic
- Clean background
- Premium visual style
- No watermark
- No random text
- No unnecessary UI
- No distorted objects

Create ONE finished image.

`;


    const result =
        await env.AI.run(
            IMAGE_MODEL,
            {
                prompt
            }
        );


    if (
        !result ||
        !result.image
    ) {

        throw new Error(
            "Image model returned no image."
        );

    }


    return {

        base64:
            result.image,

        contentType:
            "image/jpeg"

    };

}


// ============================================================
// GENERATE IMAGE ENDPOINT
// ============================================================

async function generateImageEndpoint(
    request,
    env
) {

    let body;


    try {

        body =
            await request.json();

    } catch {

        return json({

            success: false,

            error:
                "Invalid JSON request."

        }, 400);

    }


    const topic =
        String(
            body?.topic || ""
        ).trim();


    if (!topic) {

        return json({

            success: false,

            error:
                "Topic is required."

        }, 400);

    }


    try {

        const image =
            await createImage(
                env,
                topic
            );


        const imageUrl =
            await uploadImageToImgBB(
                env,
                image.base64
            );


        return json({

            success: true,

            image:
                image.base64,

            image_type:
                image.contentType,

            image_url:
                imageUrl

        });


    } catch (error) {

        return errorResponse(
            "Image generation or upload failed.",
            error
        );

    }

}


// ============================================================
// IMGBB UPLOAD
// ============================================================

async function uploadImageToImgBB(
    env,
    base64Image
) {

    if (
        !env.IMGBB_API_KEY
    ) {

        throw new Error(
            "IMGBB_API_KEY secret is missing."
        );

    }


    if (!base64Image) {

        throw new Error(
            "No base64 image was provided."
        );

    }


    const form =
        new FormData();


    form.append(
        "key",
        env.IMGBB_API_KEY
    );


    form.append(
        "image",
        base64Image
    );


    form.append(
        "name",
        `ai-x-poster-${Date.now()}`
    );


    const response =
        await fetch(
            "https://api.imgbb.com/1/upload",
            {

                method: "POST",

                body:
                    form

            }
        );


    let data;


    try {

        data =
            await response.json();

    } catch {

        throw new Error(
            `ImgBB returned invalid response. HTTP ${response.status}.`
        );

    }


    if (
        !response.ok ||
        !data?.success ||
        !data?.data?.url
    ) {

        const message =
            data?.error?.message ||
            data?.error ||
            `ImgBB upload failed with HTTP ${response.status}.`;


        throw new Error(
            String(message)
        );

    }


    return data.data.url;

}


// ============================================================
// TEST IMGBB
// ============================================================

async function testImgBB(
    env
) {

    try {

        const testImage =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";


        const imageUrl =
            await uploadImageToImgBB(
                env,
                testImage
            );


        return json({

            success: true,

            service:
                "ImgBB",

            image_url:
                imageUrl

        });


    } catch (error) {

        return errorResponse(
            "ImgBB test failed.",
            error
        );

    }

}


// ============================================================
// APITWEET COOKIE
// ============================================================

async function getApiTweetCookie(
    env
) {

    if (
        !env.APITWEET_API_KEY
    ) {

        throw new Error(
            "APITWEET_API_KEY secret is missing."
        );

    }


    if (
        !env.APITWEET_AUTH_TOKEN
    ) {

        throw new Error(
            "APITWEET_AUTH_TOKEN secret is missing."
        );

    }


    const authToken =
        encodeURIComponent(
            env.APITWEET_AUTH_TOKEN
        );


    const response =
        await fetch(
            `https://apitweet.com/api/twitter/${authToken}/cookie`,
            {

                method: "GET",

                headers: {

                    "Authorization":
                        `Bearer ${env.APITWEET_API_KEY}`,

                    "Accept":
                        "application/json"

                }

            }
        );


    const rawText =
        await response.text();


    let data;


    try {

        data =
            JSON.parse(
                rawText
            );

    } catch {

        data = {

            raw:
                rawText

        };

    }


    if (
        !response.ok
    ) {

        throw new ApiTweetError(
            `ApiTweet cookie request failed. HTTP ${response.status}.`,
            response.status,
            data
        );

    }


    const cookie =
        typeof data?.data === "string"
            ? data.data
            : typeof data?.data?.cookie === "string"
                ? data.data.cookie
                : typeof data?.cookie === "string"
                    ? data.cookie
                    : "";


    if (!cookie) {

        throw new Error(
            "ApiTweet did not return a usable X cookie."
        );

    }


    return cookie;

}


// ============================================================
// TEST APITWEET
// ============================================================

async function testApiTweet(
    env
) {

    try {

        const cookie =
            await getApiTweetCookie(
                env
            );


        return json({

            success: true,

            service:
                "ApiTweet",

            authenticated:
                true,

            cookie_received:
                !!cookie,

            message:
                "ApiTweet authentication is working. No tweet was posted."

        });


    } catch (error) {

        return errorResponse(
            "ApiTweet authentication test failed.",
            error
        );

    }

}


// ============================================================
// SLEEP
// ============================================================

function sleep(
    milliseconds
) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                milliseconds
            )
    );

}


// ============================================================
// PARSE APITWEET RATE LIMIT
// ============================================================

function getApiTweetWaitMs(
    data
) {

    const message =
        String(
            data?.msg ||
            data?.message ||
            data?.error ||
            ""
        );


    const match =
        message.match(
            /wait\s+([\d.]+)\s*seconds?/i
        );


    if (match) {

        const seconds =
            Number(
                match[1]
            );


        if (
            Number.isFinite(
                seconds
            )
        ) {

            return (
                Math.ceil(
                    seconds * 1000
                ) + 2000
            );

        }

    }


    return APITWEET_MIN_DELAY;

}


// ============================================================
// APITWEET ERROR
// ============================================================

class ApiTweetError
    extends Error {

    constructor(
        message,
        status,
        data
    ) {

        super(message);

        this.name =
            "ApiTweetError";

        this.status =
            status;

        this.data =
            data;

    }

}


// ============================================================
// CREATE TWEET WITH RETRY
// ============================================================

async function createTweetWithRetry(
    env,
    caption,
    imageUrl
) {

    // --------------------------------------------------------
    // Cookie request
    // --------------------------------------------------------

    const cookie =
        await getApiTweetCookie(
            env
        );


    // --------------------------------------------------------
    // Wait 10 seconds before tweet request
    // --------------------------------------------------------

    await sleep(
        APITWEET_MIN_DELAY
    );


    let lastError =
        null;


    for (
        let attempt = 1;
        attempt <= APITWEET_MAX_RETRIES;
        attempt++
    ) {

        try {

            const response =
                await fetch(
                    "https://apitweet.com/api/twitter/tweets/create",
                    {

                        method: "POST",

                        headers: {

                            "Authorization":
                                `Bearer ${env.APITWEET_API_KEY}`,

                            "Content-Type":
                                "application/json",

                            "Accept":
                                "application/json"

                        },

                        body:
                            JSON.stringify({

                                tweet_content:
                                    caption,

                                cookie:
                                    cookie,

                                ...(imageUrl
                                    ? {
                                        media_url:
                                            imageUrl
                                    }
                                    : {})

                            })

                    }
                );


            const rawText =
                await response.text();


            let data;


            try {

                data =
                    JSON.parse(
                        rawText
                    );

            } catch {

                data = {

                    raw:
                        rawText

                };

            }


            // ------------------------------------------------
            // SUCCESS
            // ------------------------------------------------

            if (
                response.ok
            ) {

                return data;

            }


            // ------------------------------------------------
            // RATE LIMIT
            // ------------------------------------------------

            if (
                response.status === 429
            ) {

                lastError =
                    new ApiTweetError(
                        "ApiTweet rate limit exceeded.",
                        429,
                        data
                    );


                if (
                    attempt <
                    APITWEET_MAX_RETRIES
                ) {

                    const waitMs =
                        getApiTweetWaitMs(
                            data
                        );


                    await sleep(
                        waitMs
                    );


                    continue;

                }


                throw lastError;

            }


            // ------------------------------------------------
            // OTHER ERROR
            // ------------------------------------------------

            throw new ApiTweetError(
                `ApiTweet tweet creation failed. HTTP ${response.status}.`,
                response.status,
                data
            );


        } catch (error) {

            lastError =
                error;


            if (
                error instanceof ApiTweetError &&
                error.status === 429 &&
                attempt <
                    APITWEET_MAX_RETRIES
            ) {

                continue;

            }


            throw error;

        }

    }


    throw (
        lastError ||
        new Error(
            "ApiTweet tweet creation failed."
        )
    );

}


// ============================================================
// POST TO X
// ============================================================

async function postToX(
    request,
    env
) {

    let body;


    try {

        body =
            await request.json();

    } catch {

        return json({

            success: false,

            posted: false,

            error:
                "Invalid JSON request."

        }, 400);

    }


    let caption =
        String(
            body?.caption || ""
        ).trim();


    let imageUrl =
        String(
            body?.image_url || ""
        ).trim();


    // --------------------------------------------------------
    // TOPIC MODE
    // --------------------------------------------------------

    if (
        !caption &&
        body?.topic
    ) {

        const topic =
            String(
                body.topic
            ).trim();


        if (!topic) {

            return json({

                success: false,

                posted: false,

                error:
                    "Topic is required."

            }, 400);

        }


        // ----------------------------------------------------
        // Generate caption
        // ----------------------------------------------------

        try {

            caption =
                await createCaption(
                    env,
                    topic
                );

        } catch (error) {

            return errorResponse(
                "Caption generation failed.",
                error
            );

        }


        // ----------------------------------------------------
        // Generate image
        // ----------------------------------------------------

        let image;


        try {

            image =
                await createImage(
                    env,
                    topic
                );

        } catch (error) {

            return errorResponse(
                "Image generation failed.",
                error
            );

        }


        // ----------------------------------------------------
        // Upload image
        // ----------------------------------------------------

        try {

            imageUrl =
                await uploadImageToImgBB(
                    env,
                    image.base64
                );

        } catch (error) {

            return errorResponse(
                "ImgBB upload failed.",
                error
            );

        }

    }


    // --------------------------------------------------------
    // Validate caption
    // --------------------------------------------------------

    caption =
        cleanCaption(
            caption
        );


    if (
        !caption
    ) {

        return json({

            success: false,

            posted: false,

            error:
                "Caption is required."

        }, 400);

    }


    if (
        caption.length >
        MAX_X_LENGTH
    ) {

        return json({

            success: false,

            posted: false,

            error:
                "Caption exceeds X's 280 character limit.",

            character_count:
                caption.length

        }, 400);

    }


    if (
        !imageUrl
    ) {

        return json({

            success: false,

            posted: false,

            error:
                "image_url is required."

        }, 400);

    }


    // --------------------------------------------------------
    // POST
    // --------------------------------------------------------

    try {

        const data =
            await createTweetWithRetry(
                env,
                caption,
                imageUrl
            );


        const tweetId =
            findTweetId(
                data
            );


        const tweetUrl =
            tweetId
                ? `https://x.com/i/status/${tweetId}`
                : null;


        return json({

            success: true,

            posted: true,

            caption,

            character_count:
                caption.length,

            image_url:
                imageUrl,

            tweet_id:
                tweetId,

            tweet_url:
                tweetUrl,

            apitweet:
                data

        });


    } catch (error) {

        console.error(
            "APITWEET POST ERROR:",
            error
        );


        if (
            error instanceof ApiTweetError
        ) {

            return json({

                success: false,

                posted: false,

                error:
                    "ApiTweet tweet creation failed.",

                status:
                    error.status,

                details:
                    error.data

            }, 500);

        }


        return errorResponse(
            "ApiTweet posting failed.",
            error
        );

    }

}


// ============================================================
// GENERATE CAPTION ENDPOINT
// ============================================================

async function generateCaptionEndpoint(
    request,
    env
) {

    let body;


    try {

        body =
            await request.json();

    } catch {

        return json({

            success: false,

            error:
                "Invalid JSON request."

        }, 400);

    }


    const topic =
        String(
            body?.topic || ""
        ).trim();


    if (!topic) {

        return json({

            success: false,

            error:
                "Topic is required."

        }, 400);

    }


    try {

        const caption =
            await createCaption(
                env,
                topic
            );


        return json({

            success: true,

            caption,

            character_count:
                caption.length,

            within_limit:
                caption.length <=
                MAX_X_LENGTH

        });


    } catch (error) {

        return errorResponse(
            "Caption generation failed.",
            error
        );

    }

}


// ============================================================
// FIND TWEET ID
// ============================================================

function findTweetId(
    data
) {

    if (!data) {

        return null;

    }


    const candidates = [

        data?.tweet_id,

        data?.id,

        data?.data?.tweet_id,

        data?.data?.id,

        data?.data?.tweet?.id,

        data?.data?.tweet?.tweet_id,

        data?.tweet?.id,

        data?.tweet?.tweet_id

    ];


    for (
        const value of
            candidates
    ) {

        if (
            value !== undefined &&
            value !== null &&
            String(value).trim()
        ) {

            return String(
                value
            ).trim();

        }

    }


    return null;

}


// ============================================================
// JSON RESPONSE
// ============================================================

function json(
    data,
    status = 200
) {

    return new Response(

        JSON.stringify(
            data,
            null,
            2
        ),

        {

            status,

            headers: {

                "Content-Type":
                    "application/json; charset=UTF-8",

                "Cache-Control":
                    "no-store",

                ...corsHeaders()

            }

        }

    );

}


// ============================================================
// ERROR RESPONSE
// ============================================================

function errorResponse(
    message,
    error
) {

    console.error(
        message,
        error
    );


    return json({

        success: false,

        error:
            message,

        details:
            error?.message ||
            String(error)

    }, 500);

}


// ============================================================
// CORS
// ============================================================

function corsHeaders() {

    return {

        "Access-Control-Allow-Origin":
            "*",

        "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type"

    };

}
