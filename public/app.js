"use strict";

const topicInput =
    document.getElementById("topic");

const topicCounter =
    document.getElementById("topicCounter");

const generateBtn =
    document.getElementById("generateBtn");

const generateBtnText =
    generateBtn.querySelector(".btn-text");

const resultSection =
    document.getElementById("resultSection");

const captionInput =
    document.getElementById("caption");

const characterStatus =
    document.getElementById("characterStatus");

const captionStatus =
    document.getElementById("captionStatus");

const imagePreview =
    document.getElementById("imagePreview");

const regenerateBtn =
    document.getElementById("regenerateBtn");

const regenerateImageBtn =
    document.getElementById("regenerateImageBtn");

const copyBtn =
    document.getElementById("copyBtn");

const postBtn =
    document.getElementById("postBtn");

const toast =
    document.getElementById("toast");

const toastIcon =
    document.getElementById("toastIcon");

const toastTitle =
    document.getElementById("toastTitle");

const toastMessage =
    document.getElementById("toastMessage");

let generatedImageUrl = "";
let isPosting = false;


/* =========================================
   TOPIC COUNTER
========================================= */

topicInput.addEventListener(
    "input",
    () => {

        topicCounter.textContent =
            `${topicInput.value.length} / 500`;
    }
);


/* =========================================
   CAPTION COUNTER
========================================= */

captionInput.addEventListener(
    "input",
    updateCaptionCounter
);


function updateCaptionCounter() {

    const length =
        captionInput.value.length;

    characterStatus.textContent =
        `${length} / 280`;

    characterStatus.classList.remove(
        "good",
        "warning",
        "bad"
    );


    if (length <= 240) {

        characterStatus.classList.add(
            "good"
        );

        captionStatus.textContent =
            "✓ Within character limit";

    } else if (length <= 280) {

        characterStatus.classList.add(
            "warning"
        );

        captionStatus.textContent =
            "Almost at character limit";

    } else {

        characterStatus.classList.add(
            "bad"
        );

        captionStatus.textContent =
            "Caption is too long";
    }
}


/* =========================================
   GENERATE
========================================= */

generateBtn.addEventListener(
    "click",
    generatePost
);


async function generatePost() {

    const topic =
        topicInput.value.trim();


    if (!topic) {

        showToast(
            "Topic required",
            "Enter a topic first.",
            "!"
        );

        topicInput.focus();

        return;
    }


    setGenerating(true);


    try {

        const response =
            await fetch(
                "/api/generate",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        topic
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok || !data.success) {

            throw new Error(
                data.error ||
                "AI generation failed."
            );
        }


        /* ============================
           CAPTION
        ============================ */

        captionInput.value =
            data.caption || "";

        generatedImageUrl =
            data.image_url || "";


        updateCaptionCounter();


        /* ============================
           IMAGE
        ============================ */

        if (data.image) {

            imagePreview.innerHTML = `

                <img
                    src="data:${data.image_type || "image/jpeg"};base64,${data.image}"
                    alt="AI generated image"
                >

            `;

        } else {

            imagePreview.innerHTML = `

                <div class="image-placeholder">

                    <div class="placeholder-icon">
                        ✦
                    </div>

                    <span>
                        Image generation unavailable
                    </span>

                </div>

            `;
        }


        /* ============================
           SHOW RESULT
        ============================ */

        resultSection.classList.remove(
            "hidden"
        );


        resultSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });


        showToast(
            "AI generation complete",
            "Caption and image are ready.",
            "✓"
        );


    } catch (error) {

        console.error(error);


        showToast(
            "Generation failed",
            error.message ||
            "Something went wrong.",
            "!"
        );

    } finally {

        setGenerating(false);
    }
}


/* =========================================
   REGENERATE
========================================= */

regenerateBtn.addEventListener(
    "click",
    generatePost
);


/* =========================================
   IMAGE REGENERATE
========================================= */

regenerateImageBtn.addEventListener(
    "click",
    async () => {

        const topic =
            topicInput.value.trim();


        if (!topic) {
            return;
        }


        regenerateImageBtn.disabled =
            true;

        regenerateImageBtn.textContent =
            "Generating...";


        try {

            const response =
                await fetch(
                    "/api/generate",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            topic
                        })
                    }
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.error ||
                    "Image generation failed."
                );
            }


            if (data.image) {

                generatedImageUrl =
                    data.image_url ||
                    generatedImageUrl;

                imagePreview.innerHTML = `

                    <img
                        src="data:${data.image_type || "image/jpeg"};base64,${data.image}"
                        alt="AI generated image"
                    >

                `;
            }


            showToast(
                "Image regenerated",
                "New AI image created.",
                "✓"
            );


        } catch (error) {

            showToast(
                "Image failed",
                error.message,
                "!"
            );

        } finally {

            regenerateImageBtn.disabled =
                false;

            regenerateImageBtn.textContent =
                "↻ Regenerate";
        }
    }
);


/* =========================================
   COPY
========================================= */

copyBtn.addEventListener(
    "click",
    async () => {

        const text =
            captionInput.value.trim();


        if (!text) {

            showToast(
                "Nothing to copy",
                "Generate a caption first.",
                "!"
            );

            return;
        }


        try {

            await navigator.clipboard
                .writeText(text);


            showToast(
                "Copied",
                "Caption copied.",
                "✓"
            );

        } catch {

            captionInput.select();

            document.execCommand(
                "copy"
            );


            showToast(
                "Copied",
                "Caption copied.",
                "✓"
            );
        }
    }
);


/* =========================================
   POST TO X
========================================= */

postBtn.addEventListener(
    "click",
    postToX
);


async function postToX() {

    if (isPosting) {
        return;
    }

    const caption =
        captionInput.value.trim();

    if (!caption) {

        showToast(
            "Caption required",
            "Generate a caption before posting.",
            "!"
        );

        return;
    }

    if (caption.length > 280) {

        showToast(
            "Caption too long",
            "Keep the caption within 280 characters.",
            "!"
        );

        return;
    }

    if (!generatedImageUrl) {

        showToast(
            "Image unavailable",
            "Generate the image before posting.",
            "!"
        );

        return;
    }

    isPosting = true;
    postBtn.disabled = true;
    postBtn.classList.add("loading");
    postBtn.innerHTML = "<span>𝕏</span> Posting...";

    try {

        const response =
            await fetch(
                "/api/post",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        caption,
                        image_url:
                            generatedImageUrl
                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok || !data.success || !data.posted) {

            const details =
                data?.details?.msg ||
                data?.details?.message ||
                data?.error ||
                "Unable to post to X.";

            throw new Error(details);
        }

        showToast(
            "Posted to X",
            data.tweet_url
                ? "Your post was published successfully. Tap View on X below."
                : "Your post was published successfully.",
            "✓"
        );

        if (data.tweet_url) {

            showTweetLink(data.tweet_url);
        }

    } catch (error) {

        console.error(error);

        showToast(
            "Post failed",
            error.message ||
                "Something went wrong while posting.",
            "!"
        );

    } finally {

        isPosting = false;
        postBtn.disabled = false;
        postBtn.classList.remove("loading");
        postBtn.innerHTML = "<span>𝕏</span> Post to X";
    }
}


function showTweetLink(url) {

    let link =
        document.getElementById("tweetLink");

    if (!link) {

        link = document.createElement("a");
        link.id = "tweetLink";
        link.className = "tweet-link";
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const actions =
            document.querySelector(".actions");

        actions.appendChild(link);
    }

    link.href = url;
    link.textContent = "View on X →";
}


/* =========================================
   GENERATING STATE
========================================= */

function setGenerating(state) {

    generateBtn.disabled =
        state;


    if (state) {

        generateBtnText.textContent =
            "Generating...";

        generateBtn.classList.add(
            "loading"
        );

    } else {

        generateBtnText.textContent =
            "Generate Post";

        generateBtn.classList.remove(
            "loading"
        );
    }
}


/* =========================================
   TOAST
========================================= */

let toastTimer;


function showToast(
    title,
    message,
    icon = "✓"
) {

    clearTimeout(toastTimer);


    toastIcon.textContent =
        icon;

    toastTitle.textContent =
        title;

    toastMessage.textContent =
        message;


    toast.classList.add(
        "show"
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            3500
        );
}
