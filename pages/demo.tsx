import { AnimatePresence, motion } from "framer-motion";
import { RadioGroup } from "@headlessui/react";
import { v4 as uuid } from "uuid";
import Link from "next/link";
import { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import Image from 'next/image'

const questions = [
  {
    id: 1,
    name: "Antler IC",
    description: "Answer most likely IC questions based on your startup idea.",
    icon: "/antler-logo.png",
    disabled: false,
  },
  {
    id: 2,
    name: "Salary negotiation",
    description: "Prepare for your upcoming salary negotiation conversation.",
    icon: "/salary.png",
    disabled: true,
  },
  {
    id: 3,
    name: "Consulting interview",
    description: "Ace your MBP interview by practicing case questions.",
    icon: "/case.png",
    disabled: true,
  },
];

const ffmpeg = createFFmpeg({
  // corePath: `http://localhost:3000/ffmpeg/dist/ffmpeg-core.js`,
  // I've included a default import above (and files in the public directory), but you can also use a CDN like this:
  corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
  log: true,
});

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function DemoPage() {
  const [selected, setSelected] = useState(questions[0]);
  const [step, setStep] = useState(1);
  const [startupDescription, setStartupDescription] = useState("");
  const [committeeQuestions, setCommitteeQuestions] = useState<string[]>([]);
  const [selectedCommitteeQuestions, setSelectedCommitteeQuestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const webcamRef = useRef<Webcam | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [seconds, setSeconds] = useState(150);
  const [recordingPermission, setRecordingPermission] = useState(true);
  const [cameraLoaded, setCameraLoaded] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Processing");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [generatedFeedback, setGeneratedFeedback] = useState("");
  const [start, setStart] = useState(false);

  useEffect(() => {
    setIsDesktop(window.innerWidth >= 768);
  }, []);

  useEffect(() => {
    if (start) {
      const element = document.getElementById("startTimer");

      if (element) {
        element.style.display = "flex";
      }

      setCapturing(true);

      mediaRecorderRef.current = new MediaRecorder(
        webcamRef?.current?.stream as MediaStream
      );
      mediaRecorderRef.current.addEventListener(
        "dataavailable",
        handleDataAvailable
      );
      mediaRecorderRef.current.start();
    }
  }, [start, webcamRef, setCapturing, mediaRecorderRef]);

  const handleStartCaptureClick = useCallback(() => {
    const startTimer = document.getElementById("startTimer");
    if (startTimer) {
      startTimer.style.display = "none";
    }

    setStart(true);
  }, [webcamRef, setCapturing, mediaRecorderRef]);

  const handleDataAvailable = useCallback(
    ({ data }: BlobEvent) => {
      if (data.size > 0) {
        setRecordedChunks((prev) => prev.concat(data));
      }
    },
    [setRecordedChunks]
  );

  const handleStopCaptureClick = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setCapturing(false);
  }, [mediaRecorderRef, webcamRef, setCapturing]);

  useEffect(() => {
    let timer: any = null;
    if (capturing) {
      timer = setInterval(() => {
        setSeconds((seconds) => seconds - 1);
      }, 1000);
      if (seconds === 0) {
        handleStopCaptureClick();
        setCapturing(false);
        setSeconds(0);
      }
    }
    return () => {
      clearInterval(timer);
    };
  });

  const handleNewQuestions = async () => {
    const prompt = `Create a list of 8 comprehensive question that you would ask the startup's founders during the pitch presentation. These question should help you assess the startup's viability and potential for investment. Do not explain why you picked the question.`

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        startupDescription
      }),
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    setCommitteeQuestions([]);
    setSelectedCommitteeQuestions(0);

    // This data is a ReadableStream
    const data = response.body;
    if (!data) {
      return;
    }

    const reader = data.getReader();
    const decoder = new TextDecoder();
    let done = false;

    let questions = "";

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value);
      questions += chunkValue;
    }

    const splitted = questions.split("\n").map((q) => q.trim().substring(3));
    console.log({ questions, splitted })

    setCommitteeQuestions(splitted);
    setSelectedCommitteeQuestions(Math.floor(Math.random() * splitted.length));
  }

  useEffect(() => {
    if (step === 3)
      handleNewQuestions()
  }, [step])

  const handleDownload = async () => {
    if (recordedChunks.length) {
      setSubmitting(true);
      setStatus("Processing");

      const file = new Blob(recordedChunks, {
        type: `video/webm`,
      });

      const unique_id = uuid();

      // This checks if ffmpeg is loaded
      if (!ffmpeg.isLoaded()) {
        await ffmpeg.load();
      }

      // This writes the file to memory, removes the video, and converts the audio to mp3
      ffmpeg.FS("writeFile", `${unique_id}.webm`, await fetchFile(file));
      await ffmpeg.run(
        "-i",
        `${unique_id}.webm`,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "mp3",
        `${unique_id}.mp3`
      );

      // This reads the converted file from the file system
      const fileData = ffmpeg.FS("readFile", `${unique_id}.mp3`);
      // This creates a new file from the raw data
      const output = new File([fileData.buffer], `${unique_id}.mp3`, {
        type: "audio/mp3",
      });

      const formData = new FormData();
      formData.append("file", output, `${unique_id}.mp3`);
      formData.append("model", "whisper-1");

      const question = committeeQuestions[selectedCommitteeQuestions];

      setStatus("Transcribing");

      const upload = await fetch(
        `/api/transcribe?question=${encodeURIComponent(question)}`,
        {
          method: "POST",
          body: formData,
        }
      );
      const results = await upload.json();

      if (upload.ok) {
        setIsSuccess(true);
        setSubmitting(false);

        if (results.error) {
          setTranscript(results.error);
        } else {
          setTranscript(results.transcript);
        }

        console.log("Uploaded successfully!");

        await Promise.allSettled([
          new Promise((resolve) => setTimeout(resolve, 800)),
        ]).then(() => {
          setCompleted(true);
          console.log("Success!");
        });


        if (results.transcript.length > 0) {
          const prompt = `Please give feedback on my response as a startup founder to the quesiton: ${question} given the following transcript: ${results.transcript
            }. Please give me a feedback whether you would invest based on the response. If there are any, write pros, cons and how I can improve the response.`;

          setGeneratedFeedback("");
          const response = await fetch("/api/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt,
              startupDescription
            }),
          });

          if (!response.ok) {
            throw new Error(response.statusText);
          }

          // This data is a ReadableStream
          const data = response.body;
          if (!data) {
            return;
          }

          const reader = data.getReader();
          const decoder = new TextDecoder();
          let done = false;

          while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            const chunkValue = decoder.decode(value);
            setGeneratedFeedback((prev: any) => prev + chunkValue);
          }
        }
      } else {
        console.error("Upload failed.");
      }

      setTimeout(function () {
        setRecordedChunks([]);
      }, 1500);
    }
  };

  function restartVideo() {
    setRecordedChunks([]);
    setCapturing(false);
    setSeconds(150);
    setStart(false);
  }

  const videoConstraints = isDesktop
    ? { width: 1280, height: 720, facingMode: "user" }
    : { width: 480, height: 640, facingMode: "user" };

  const handleUserMedia = () => {
    setTimeout(() => {
      setLoading(false);
      setCameraLoaded(true);
    }, 1000);
  };

  return (
    <AnimatePresence>
      {step === 3 ? (
        <div className="w-full min-h-screen flex flex-col px-4 pt-2 pb-8 md:px-8 md:py-2 bg-[#FCFCFC] relative overflow-x-hidden">
          {completed ? (
            <div className="w-full flex flex-col max-w-[1080px] mx-auto mt-[10vh] overflow-y-auto pb-8 md:pb-12">
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.35, ease: [0.075, 0.82, 0.165, 1] }}
                className="relative md:aspect-[16/9] w-full max-w-[1080px] overflow-hidden bg-[#1D2B3A] rounded-lg ring-1 ring-gray-900/5 shadow-md flex flex-col items-center justify-center"
              >
                <video
                  className="w-full h-full rounded-lg"
                  controls
                  crossOrigin="anonymous"
                  autoPlay
                >
                  <source
                    src={URL.createObjectURL(
                      new Blob(recordedChunks, { type: "video/mp4" })
                    )}
                    type="video/mp4"
                  />
                </video>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.5,
                  duration: 0.15,
                  ease: [0.23, 1, 0.82, 1],
                }}
                className="flex flex-col md:flex-row items-center mt-2 md:mt-4 md:justify-between space-y-1 md:space-y-0"
              >
                <div className="flex flex-row items-center space-x-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4 text-[#407BBF] shrink-0"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                  <p className="text-[14px] font-normal leading-[20px] text-[#1a2b3b]">
                    Video is not stored on our servers, and will go away as soon
                    as you leave the page.
                  </p>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.5,
                  duration: 0.15,
                  ease: [0.23, 1, 0.82, 1],
                }}
                className="mt-8 flex flex-col"
              >
                <div>
                  <h2 className="text-xl font-semibold text-left text-[#1D2B3A] mb-2">
                    Transcript
                  </h2>
                  <p className="prose prose-sm max-w-none">
                    {transcript.length > 0
                      ? transcript
                      : "Don't think you said anything. Want to try again?"}
                  </p>
                </div>
                <div className="mt-8">
                  <h2 className="text-xl font-semibold text-left text-[#1D2B3A] mb-2">
                    Feedback
                  </h2>
                  <div className="mt-4 text-sm flex gap-2.5 rounded-lg border border-[#EEEEEE] bg-[#FAFAFA] p-4 leading-6 text-gray-900 min-h-[100px]">
                    <p className="prose prose-sm max-w-none whitespace-pre-line">
                      {generatedFeedback}
                    </p>
                  </div>
                </div>
                <div className="mt-8">
                  <button
                    onClick={() => {
                      setTranscript("")
                      setGeneratedFeedback("")
                      setCompleted(false)
                      setIsSuccess(false)
                      let newQuestionIndex = 0
                      do {
                        newQuestionIndex = Math.floor(Math.random() * committeeQuestions.length)
                        console.log({ newQuestionIndex, selectedCommitteeQuestions })
                      } while (newQuestionIndex === selectedCommitteeQuestions)
                      setSelectedCommitteeQuestions(newQuestionIndex);
                      restartVideo()
                    }}
                    className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#1E2B3A] text-white hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex gap-x-2  active:scale-95 scale-100 duration-75"
                    style={{
                      boxShadow:
                        "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <span> Next question </span>
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M13.75 6.75L19.25 12L13.75 17.25"
                        stroke="#FFF"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M19 12H4.75"
                        stroke="#FFF"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="h-full w-full items-center flex flex-col mt-[10vh]">
              {recordingPermission ? (
                <div className="w-full flex flex-col max-w-[1080px] mx-auto justify-center">
                  <h2 className="text-2xl font-semibold text-left text-[#1D2B3A] mb-2">
                    {committeeQuestions[selectedCommitteeQuestions] ?? "Generating questions..."}
                    {/* {selected.name === "Behavioral"
                      ? `PEI: Tell me about a time when you led a team through a difficult situation?`
                      : selectedInterviewer.name === "John"
                        ? "What is a Hash Table, and what is the average case and worst case time for each of its operations?"
                        : selectedInterviewer.name === "Jenny"
                          ? "Structure this case: Your client is a global tech company that's developing a new artificial intelligence product. They are planning to launch ..."
                          : selectedInterviewer.name === "Richard"
                            ? "Uber is looking to expand its product line. Talk me through how you would approach this problem."
                            : "You have a 3-gallon jug and 5-gallon jug, how do you measure out exactly 4 gallons?"} */}
                  </h2>
                  <span className="text-[14px] leading-[20px] text-[#1a2b3b] font-normal mb-4">
                    Hit the record button to start answering the question. Be concise and straight to the point - no fluff!
                  </span>
                  <motion.div
                    initial={{ y: -20 }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: 0.35,
                      ease: [0.075, 0.82, 0.965, 1],
                    }}
                    className="relative aspect-[16/9] w-full max-w-[1080px] overflow-hidden bg-[#1D2B3A] rounded-lg ring-1 ring-gray-900/5 shadow-md"
                  >
                    {!cameraLoaded && (
                      <div className="text-white absolute top-1/2 left-1/2 z-20 flex items-center">
                        <svg
                          className="animate-spin h-4 w-4 text-white mx-auto my-0.5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth={3}
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      </div>
                    )}
                    <div className="relative z-10 h-full w-full rounded-lg">
                      <div className="absolute top-5 lg:top-10 left-5 lg:left-10 z-20">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-800">
                          {new Date(seconds * 1000).toISOString().slice(14, 19)}
                        </span>
                      </div>
                      <Webcam
                        mirrored
                        audio
                        muted
                        ref={webcamRef}
                        videoConstraints={videoConstraints}
                        onUserMedia={handleUserMedia}
                        onUserMediaError={(error) => {
                          setRecordingPermission(false);
                        }}
                        className="absolute z-10 min-h-[100%] min-w-[100%] h-auto w-auto object-cover"
                      />
                    </div>
                    {loading && (
                      <div className="absolute flex h-full w-full items-center justify-center">
                        <div className="relative h-[112px] w-[112px] rounded-lg object-cover text-[2rem]">
                          <div className="flex h-[112px] w-[112px] items-center justify-center rounded-[0.5rem] bg-[#4171d8] !text-white">
                            Loading...
                          </div>
                        </div>
                      </div>
                    )}

                    {cameraLoaded && (
                      <div className="absolute bottom-0 left-0 z-50 flex h-[82px] w-full items-center justify-center">
                        {recordedChunks.length > 0 ? (
                          <>
                            {isSuccess ? (
                              <button
                                className="cursor-disabled group rounded-full min-w-[140px] px-4 py-2 text-[13px] font-semibold group inline-flex items-center justify-center text-sm text-white duration-150 bg-green-500 hover:bg-green-600 hover:text-slate-100 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 active:scale-100 active:bg-green-800 active:text-green-100"
                                style={{
                                  boxShadow:
                                    "0px 1px 4px rgba(27, 71, 13, 0.17), inset 0px 0px 0px 1px #5fc767, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                                }}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5 mx-auto"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <motion.path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 0.5 }}
                                  />
                                </svg>
                              </button>
                            ) : (
                              <div className="flex flex-row gap-2">
                                {!isSubmitting && (
                                  <button
                                    onClick={() => restartVideo()}
                                    className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-white text-[#1E2B3A] hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex gap-x-2  active:scale-95 scale-100 duration-75"
                                  >
                                    Restart
                                  </button>
                                )}
                                <button
                                  onClick={handleDownload}
                                  disabled={isSubmitting}
                                  className="group rounded-full min-w-[140px] px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#1E2B3A] text-white hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex  active:scale-95 scale-100 duration-75  disabled:cursor-not-allowed"
                                  style={{
                                    boxShadow:
                                      "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                                  }}
                                >
                                  <span>
                                    {isSubmitting ? (
                                      <div className="flex items-center justify-center gap-x-2">
                                        <svg
                                          className="animate-spin h-5 w-5 text-slate-50 mx-auto"
                                          xmlns="http://www.w3.org/2000/svg"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                        >
                                          <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth={3}
                                          ></circle>
                                          <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                          ></path>
                                        </svg>
                                        <span>{status}</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center gap-x-2">
                                        <span>Process transcript</span>
                                        <svg
                                          className="w-5 h-5"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          xmlns="http://www.w3.org/2000/svg"
                                        >
                                          <path
                                            d="M13.75 6.75L19.25 12L13.75 17.25"
                                            stroke="white"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                          <path
                                            d="M19 12H4.75"
                                            stroke="white"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        </svg>
                                      </div>
                                    )}
                                  </span>
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="absolute bottom-[6px] md:bottom-5 left-5 right-5">
                            <div className="lg:mt-4 flex flex-col items-center justify-center gap-2">
                              {capturing ? (
                                <div
                                  id="stopTimer"
                                  onClick={handleStopCaptureClick}
                                  className="flex h-10 w-10 flex-col items-center justify-center rounded-full bg-transparent text-white hover:shadow-xl ring-4 ring-white  active:scale-95 scale-100 duration-75 cursor-pointer"
                                >
                                  <div className="h-5 w-5 rounded bg-red-500 cursor-pointer"></div>
                                </div>
                              ) : (
                                <button
                                  id="startTimer"
                                  onClick={handleStartCaptureClick}
                                  className="flex h-8 w-8 sm:h-8 sm:w-8 flex-col items-center justify-center rounded-full bg-red-500 text-white hover:shadow-xl ring-4 ring-white ring-offset-gray-500 ring-offset-2 active:scale-95 scale-100 duration-75"
                                ></button>
                              )}
                              <div className="w-12"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div
                      className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 text-5xl text-white font-semibold text-center"
                      id="countdown"
                    ></div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.5,
                      duration: 0.15,
                      ease: [0.23, 1, 0.82, 1],
                    }}
                    className="flex flex-row space-x-1 mt-4 items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4 text-[#407BBF]"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                      />
                    </svg>
                    <p className="text-[14px] font-normal leading-[20px] text-[#1a2b3b]">
                      Video is not stored on our servers, it is solely used for
                      transcription.
                    </p>
                  </motion.div>
                </div>
              ) : (
                <div className="w-full flex flex-col max-w-[1080px] mx-auto justify-center">
                  <motion.div
                    initial={{ y: 20 }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: 0.35,
                      ease: [0.075, 0.82, 0.165, 1],
                    }}
                    className="relative md:aspect-[16/9] w-full max-w-[1080px] overflow-hidden bg-[#1D2B3A] rounded-lg ring-1 ring-gray-900/5 shadow-md flex flex-col items-center justify-center"
                  >
                    <p className="text-white font-medium text-lg text-center max-w-3xl">
                      Camera permission is denied. We don{`'`}t store your
                      attempts anywhere, but we understand not wanting to give
                      us access to your camera. Try again by opening this page
                      in an incognito window {`(`}or enable permissions in your
                      browser settings{`)`}.
                    </p>
                  </motion.div>
                  <div className="flex flex-row space-x-4 mt-8 justify-end">
                    <button
                      onClick={() => setStep(1)}
                      className="group max-w-[200px] rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#f5f7f9] text-[#1E2B3A] no-underline active:scale-95 scale-100 duration-75"
                      style={{
                        boxShadow: "0 1px 1px #0c192714, 0 1px 3px #0c192724",
                      }}
                    >
                      Restart demo
                    </button>
                    <Link
                      href="https://github.com/gerwinf/ai-prep"
                      target="_blank"
                      className="group rounded-full pl-[8px] min-w-[180px] pr-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#1E2B3A] text-white hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex gap-x-2  active:scale-95 scale-100 duration-75"
                      style={{
                        boxShadow:
                          "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                      }}
                    >
                      <span className="w-5 h-5 rounded-full bg-[#407BBF] flex items-center justify-center">
                        <svg
                          className="w-[16px] h-[16px] text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4.75 7.75C4.75 6.64543 5.64543 5.75 6.75 5.75H17.25C18.3546 5.75 19.25 6.64543 19.25 7.75V16.25C19.25 17.3546 18.3546 18.25 17.25 18.25H6.75C5.64543 18.25 4.75 17.3546 4.75 16.25V7.75Z"
                          ></path>
                          <path
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5.5 6.5L12 12.25L18.5 6.5"
                          ></path>
                        </svg>
                      </span>
                      Star on Github
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col md:flex-row w-full md:overflow-hidden">
          <div className="w-full min-h-[60vh] md:w-1/2 md:h-screen flex flex-col px-4 pt-2 pb-8 md:px-0 md:py-2 bg-[#FCFCFC] justify-center">
            <div className="h-full w-full items-center justify-center flex flex-col">
              {step === 1 ? (
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -40 }}
                  key="step-1"
                  transition={{
                    duration: 0.95,
                    ease: [0.165, 0.84, 0.44, 1],
                  }}
                  className="max-w-lg mx-auto px-4 lg:px-0"
                >
                  <h2 className="text-4xl font-bold text-[#1E2B3A]">
                    Select a interview type
                  </h2>
                  <p className="text-[14px] leading-[20px] text-[#1a2b3b] font-normal my-4">
                    Our AI interview simulator has hundreds of questions to assess your performance.
                    Choose the type of interview you want to prepare for.
                  </p>
                  <div>
                    <RadioGroup value={selected} onChange={setSelected}>
                      <RadioGroup.Label className="sr-only">
                        Server size
                      </RadioGroup.Label>
                      <div className="space-y-4">
                        {questions.map((question) => (
                          <RadioGroup.Option
                            disabled={question.disabled}
                            key={question.name}
                            value={question}
                            className={({ checked, active }) =>
                              classNames(
                                checked
                                  ? "border-transparent"
                                  : "border-gray-300",
                                active
                                  ? "border-blue-500 ring-2 ring-blue-200"
                                  : "",
                                question.disabled
                                  ? "opacity-50 cursor-not-allowed"
                                  : "cursor-pointer",
                                "relative cursor-pointer rounded-lg border bg-white px-6 py-4 shadow-sm focus:outline-none flex justify-between"
                              )
                            }
                          >
                            {({ active, checked }) => (
                              <>
                                <span className="flex items-center">
                                  <span className="flex flex-col text-sm">
                                    <RadioGroup.Label
                                      as="span"
                                      className="font-medium text-gray-900"
                                    >
                                      {question.name}
                                    </RadioGroup.Label>
                                    <RadioGroup.Description
                                      as="span"
                                      className="text-gray-500"
                                    >
                                      <span className="block">
                                        {question.description}
                                      </span>
                                    </RadioGroup.Description>
                                  </span>
                                </span>
                                <RadioGroup.Description
                                  as="span"
                                  className="flex text-sm ml-4 mt-0 flex-col text-right items-center justify-center"
                                >
                                  <Image src={question.icon} alt="" width={32} height={32} />
                                </RadioGroup.Description>
                                <span
                                  className={classNames(
                                    active ? "border" : "border-2",
                                    checked
                                      ? "border-blue-500"
                                      : "border-transparent",
                                    "pointer-events-none absolute -inset-px rounded-lg"
                                  )}
                                  aria-hidden="true"
                                />
                              </>
                            )}
                          </RadioGroup.Option>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>
                  <p className="text-[14px] leading-[20px] text-[#1a2b3b] font-normal my-4">
                    ...and more to come!
                  </p>
                  <div className="flex gap-[15px] justify-end mt-8">
                    <div>
                      <Link
                        href="/"
                        className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#f5f7f9] text-[#1E2B3A] no-underline active:scale-95 scale-100 duration-75"
                        style={{
                          boxShadow: "0 1px 1px #0c192714, 0 1px 3px #0c192724",
                        }}
                      >
                        Back to home
                      </Link>
                    </div>
                    <div>
                      <button
                        onClick={() => {
                          setStep(2);
                        }}
                        className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#1E2B3A] text-white hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex gap-x-2  active:scale-95 scale-100 duration-75"
                        style={{
                          boxShadow:
                            "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                        }}
                      >
                        <span> Continue </span>
                        <svg
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M13.75 6.75L19.25 12L13.75 17.25"
                            stroke="#FFF"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M19 12H4.75"
                            stroke="#FFF"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : step === 2 ? (
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -40 }}
                  key="step-2"
                  transition={{
                    duration: 0.95,
                    ease: [0.165, 0.84, 0.44, 1],
                  }}
                  className="max-w-lg mx-auto px-4 lg:px-0"
                >
                  <h2 className="text-4xl font-bold text-[#1E2B3A]">
                    Describe your startup
                  </h2>
                  <p className="text-[14px] leading-[20px] text-[#1a2b3b] font-normal my-4">
                    Describe your startup in 200 characters or less for AI to generate the questions specific to you.
                  </p>
                  <div>
                    <textarea
                      value={startupDescription}
                      onChange={(e) => setStartupDescription(e.target.value)}
                      className="resize-none w-full rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-transparent p-4 text-[14px] leading-[20px] text-[#1a2b3b] font-normal"
                      name="startup" id="startup" cols={30} rows={4} maxLength={200}></textarea>
                    <span>{startupDescription.length}/200</span>
                  </div>
                  <div className="flex gap-[15px] justify-end mt-8">
                    <div>
                      <button
                        onClick={() => setStep(1)}
                        className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#f5f7f9] text-[#1E2B3A] no-underline active:scale-95 scale-100 duration-75"
                        style={{
                          boxShadow: "0 1px 1px #0c192714, 0 1px 3px #0c192724",
                        }}
                      >
                        Previous step
                      </button>
                    </div>
                    <div>
                      <button
                        disabled={startupDescription.length === 0}
                        onClick={() => {
                          setStep(3);
                        }}
                        className={
                          classNames(
                            startupDescription.length === 0 ? "cursor-not-allowed" : "",
                            "group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#1E2B3A] text-white hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex gap-x-2  active:scale-95 scale-100 duration-75"
                          )}
                        style={{
                          boxShadow:
                            "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                        }}
                      >
                        <span> Continue </span>
                        <svg
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M13.75 6.75L19.25 12L13.75 17.25"
                            stroke="#FFF"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M19 12H4.75"
                            stroke="#FFF"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (<p>Step 3</p>)}
            </div>
          </div>
          <div className="w-full h-[40vh] md:w-1/2 md:h-screen bg-[#F1F2F4] relative overflow-hidden">
            <svg
              id="texture"
              style={{ filter: "contrast(120%) brightness(120%)" }}
              className="fixed z-[1] w-full h-full opacity-[35%]"
            >
              <filter id="noise" data-v-1d260e0e="">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency=".8"
                  numOctaves="4"
                  stitchTiles="stitch"
                  data-v-1d260e0e=""
                ></feTurbulence>
                <feColorMatrix
                  type="saturate"
                  values="0"
                  data-v-1d260e0e=""
                ></feColorMatrix>
              </filter>
              <rect
                width="100%"
                height="100%"
                filter="url(#noise)"
                data-v-1d260e0e=""
              ></rect>
            </svg>
            <figure
              className="absolute md:top-1/2 ml-[-380px] md:ml-[0px] md:-mt-[240px] left-1/2 grid transform scale-[0.5] sm:scale-[0.6] md:scale-[130%] w-[760px] h-[540px] bg-[#f5f7f9] text-[9px] origin-[50%_15%] md:origin-[50%_25%] rounded-[15px] overflow-hidden p-2 z-20"
              style={{
                grid: "100%/repeat(1,calc(5px * 28)) 1fr",
                boxShadow:
                  "0 192px 136px rgba(26,43,59,.23),0 70px 50px rgba(26,43,59,.16),0 34px 24px rgba(26,43,59,.13),0 17px 12px rgba(26,43,59,.1),0 7px 5px rgba(26,43,59,.07), 0 50px 100px -20px rgb(50 50 93 / 25%), 0 30px 60px -30px rgb(0 0 0 / 30%), inset 0 -2px 6px 0 rgb(10 37 64 / 35%)",
              }}
            >
              <div className="z-20 absolute h-full w-full bg-transparent cursor-default"></div>
              <div
                className="bg-white flex flex-col text-[#1a2b3b] p-[18px] rounded-lg relative"
                style={{ boxShadow: "inset -1px 0 0 #fff" }}
              >
                <ul className="mb-auto list-none">
                  <li className="list-none flex items-center">
                    <motion.svg
                      initial={{ opacity: 0, y: 40 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.15,
                        duration: 0.95,
                        ease: [0.165, 0.84, 0.44, 1],
                      }}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 260 90"
                      className="iconLeft w-12 h-6">
                      <g id="2712b328-e7db-46b8-8822-28d4d4743559" fill="black" transform="matrix(4.71327589611677,0,0,4.71327589611677,76.3155288524854,-3.47604187237215)">
                        <path d="M6.94 8.69L6.94 8.69Q7.20 9.46 7.20 10.44L7.20 10.44L7.20 10.44Q7.20 11.44 6.96 12.15L6.96 12.15L6.96 12.15Q6.65 13.08 5.96 13.59L5.96 13.59L5.96 13.59Q5.28 14.11 4.26 14.11L4.26 14.11L4.26 14.11Q3.28 14.11 2.66 13.43L2.66 13.43L2.66 13.43Q2.63 13.38 2.60 13.39L2.60 13.39L2.60 13.39Q2.56 13.40 2.56 13.45L2.56 13.45L2.56 16.42L2.56 16.42Q2.56 16.65 2.34 16.65L2.34 16.65L1.16 16.65L1.16 16.65Q0.94 16.65 0.94 16.42L0.94 16.42L0.94 7.07L0.94 7.07Q0.94 6.85 1.16 6.85L1.16 6.85L2.34 6.85L2.34 6.85Q2.56 6.85 2.56 7.07L2.56 7.07L2.56 7.43L2.56 7.43Q2.56 7.49 2.60 7.50L2.60 7.50L2.60 7.50Q2.63 7.52 2.66 7.46L2.66 7.46L2.66 7.46Q3.26 6.73 4.26 6.73L4.26 6.73L4.26 6.73Q5.24 6.73 5.94 7.26L5.94 7.26L5.94 7.26Q6.64 7.78 6.94 8.69L6.94 8.69ZM5.11 12.12L5.11 12.12Q5.52 11.51 5.52 10.42L5.52 10.42L5.52 10.42Q5.52 9.41 5.18 8.82L5.18 8.82L5.18 8.82Q4.82 8.15 4.00 8.15L4.00 8.15L4.00 8.15Q3.30 8.15 2.91 8.81L2.91 8.81L2.91 8.81Q2.59 9.35 2.59 10.43L2.59 10.43L2.59 10.43Q2.59 11.52 2.94 12.10L2.94 12.10L2.94 12.10Q3.32 12.71 3.99 12.71L3.99 12.71L3.99 12.71Q4.72 12.71 5.11 12.12L5.11 12.12ZM11.97 6.76L11.97 6.76Q12.38 6.76 12.71 6.92L12.71 6.92L12.71 6.92Q12.88 7 12.84 7.20L12.84 7.20L12.61 8.36L12.61 8.36Q12.60 8.47 12.54 8.50L12.54 8.50L12.54 8.50Q12.47 8.53 12.35 8.50L12.35 8.50L12.35 8.50Q12.18 8.44 11.90 8.44L11.90 8.44L11.90 8.44Q11.73 8.44 11.63 8.46L11.63 8.46L11.63 8.46Q11.05 8.48 10.65 8.87L10.65 8.87L10.65 8.87Q10.26 9.25 10.26 9.87L10.26 9.87L10.26 13.78L10.26 13.78Q10.26 14 10.04 14L10.04 14L8.86 14L8.86 14Q8.64 14 8.64 13.78L8.64 13.78L8.64 7.07L8.64 7.07Q8.64 6.85 8.86 6.85L8.86 6.85L10.04 6.85L10.04 6.85Q10.26 6.85 10.26 7.07L10.26 7.07L10.26 7.62L10.26 7.62Q10.26 7.67 10.29 7.69L10.29 7.69L10.29 7.69Q10.32 7.70 10.35 7.64L10.35 7.64L10.35 7.64Q10.93 6.76 11.97 6.76L11.97 6.76ZM17.11 12.74L17.11 12.74Q17.63 12.73 18.01 12.52L18.01 12.52L18.01 12.52Q18.40 12.32 18.63 11.97L18.63 11.97L18.63 11.97Q18.70 11.86 18.82 11.86L18.82 11.86L18.82 11.86Q18.89 11.86 18.94 11.90L18.94 11.90L19.61 12.43L19.61 12.43Q19.71 12.53 19.71 12.61L19.71 12.61L19.71 12.61Q19.71 12.67 19.67 12.74L19.67 12.74L19.67 12.74Q19.26 13.38 18.56 13.75L18.56 13.75L18.56 13.75Q17.86 14.11 16.95 14.11L16.95 14.11L16.95 14.11Q15.85 14.11 15.10 13.59L15.10 13.59L15.10 13.59Q14.35 13.06 14.01 12.12L14.01 12.12L14.01 12.12Q13.73 11.35 13.73 10.39L13.73 10.39L13.73 10.39Q13.73 9.42 13.89 8.90L13.89 8.90L13.89 8.90Q14.15 7.91 14.94 7.32L14.94 7.32L14.94 7.32Q15.72 6.73 16.84 6.73L16.84 6.73L16.84 6.73Q19.46 6.73 19.91 9.60L19.91 9.60L19.91 9.60Q19.98 10.07 20.01 10.75L20.01 10.75L20.01 10.75Q20.01 10.98 19.78 10.98L19.78 10.98L15.44 10.98L15.44 10.98Q15.36 10.98 15.36 11.06L15.36 11.06L15.36 11.06Q15.36 11.44 15.44 11.68L15.44 11.68L15.44 11.68Q15.60 12.18 16.03 12.46L16.03 12.46L16.03 12.46Q16.46 12.74 17.11 12.74L17.11 12.74ZM16.83 8.13L16.83 8.13Q16.30 8.13 15.95 8.39L15.95 8.39L15.95 8.39Q15.61 8.65 15.48 9.11L15.48 9.11L15.48 9.11Q15.39 9.39 15.37 9.70L15.37 9.70L15.37 9.70Q15.36 9.79 15.44 9.79L15.44 9.79L18.26 9.79L18.26 9.79Q18.34 9.79 18.34 9.70L18.34 9.70L18.34 9.70Q18.28 9.28 18.26 9.20L18.26 9.20L18.26 9.20Q18.13 8.71 17.76 8.42L17.76 8.42L17.76 8.42Q17.39 8.13 16.83 8.13L16.83 8.13ZM27.57 8.69L27.57 8.69Q27.82 9.46 27.82 10.44L27.82 10.44L27.82 10.44Q27.82 11.44 27.58 12.15L27.58 12.15L27.58 12.15Q27.27 13.08 26.59 13.59L26.59 13.59L26.59 13.59Q25.90 14.11 24.88 14.11L24.88 14.11L24.88 14.11Q23.90 14.11 23.28 13.43L23.28 13.43L23.28 13.43Q23.25 13.38 23.22 13.39L23.22 13.39L23.22 13.39Q23.18 13.40 23.18 13.45L23.18 13.45L23.18 16.42L23.18 16.42Q23.18 16.65 22.96 16.65L22.96 16.65L21.78 16.65L21.78 16.65Q21.56 16.65 21.56 16.42L21.56 16.42L21.56 7.07L21.56 7.07Q21.56 6.85 21.78 6.85L21.78 6.85L22.96 6.85L22.96 6.85Q23.18 6.85 23.18 7.07L23.18 7.07L23.18 7.43L23.18 7.43Q23.18 7.49 23.22 7.50L23.22 7.50L23.22 7.50Q23.25 7.52 23.28 7.46L23.28 7.46L23.28 7.46Q23.88 6.73 24.88 6.73L24.88 6.73L24.88 6.73Q25.86 6.73 26.56 7.26L26.56 7.26L26.56 7.26Q27.26 7.78 27.57 8.69L27.57 8.69ZM25.73 12.12L25.73 12.12Q26.14 11.51 26.14 10.42L26.14 10.42L26.14 10.42Q26.14 9.41 25.80 8.82L25.80 8.82L25.80 8.82Q25.44 8.15 24.63 8.15L24.63 8.15L24.63 8.15Q23.93 8.15 23.53 8.81L23.53 8.81L23.53 8.81Q23.21 9.35 23.21 10.43L23.21 10.43L23.21 10.43Q23.21 11.52 23.56 12.10L23.56 12.10L23.56 12.10Q23.94 12.71 24.61 12.71L24.61 12.71L24.61 12.71Q25.34 12.71 25.73 12.12L25.73 12.12ZM30.18 5.95L30.18 5.95Q29.72 5.95 29.43 5.66L29.43 5.66L29.43 5.66Q29.13 5.38 29.13 4.93L29.13 4.93L29.13 4.93Q29.13 4.48 29.43 4.20L29.43 4.20L29.43 4.20Q29.72 3.92 30.18 3.92L30.18 3.92L30.18 3.92Q30.65 3.92 30.93 4.20L30.93 4.20L30.93 4.20Q31.22 4.48 31.22 4.93L31.22 4.93L31.22 4.93Q31.22 5.38 30.93 5.66L30.93 5.66L30.93 5.66Q30.65 5.95 30.18 5.95L30.18 5.95ZM29.60 14L29.60 14Q29.37 14 29.37 13.78L29.37 13.78L29.37 7.07L29.37 7.07Q29.37 6.85 29.60 6.85L29.60 6.85L30.77 6.85L30.77 6.85Q31.00 6.85 31.00 7.07L31.00 7.07L31.00 13.78L31.00 13.78Q31.00 14 30.77 14L30.77 14L29.60 14ZM35.81 14.11L35.81 14.11Q34.73 14.11 33.95 13.56L33.95 13.56L33.95 13.56Q33.17 13.01 32.86 12.07L32.86 12.07L32.86 12.07Q32.63 11.44 32.63 10.39L32.63 10.39L32.63 10.39Q32.63 9.38 32.86 8.74L32.86 8.74L32.86 8.74Q33.15 7.81 33.94 7.27L33.94 7.27L33.94 7.27Q34.73 6.73 35.81 6.73L35.81 6.73L35.81 6.73Q36.90 6.73 37.72 7.28L37.72 7.28L37.72 7.28Q38.53 7.83 38.79 8.65L38.79 8.65L38.79 8.65Q38.84 8.78 38.88 9.04L38.88 9.04L38.88 9.10L38.88 9.10Q38.88 9.25 38.70 9.30L38.70 9.30L37.53 9.48L37.48 9.48L37.48 9.48Q37.32 9.48 37.28 9.31L37.28 9.31L37.24 9.13L37.24 9.13Q37.14 8.71 36.75 8.42L36.75 8.42L36.75 8.42Q36.36 8.13 35.81 8.13L35.81 8.13L35.81 8.13Q35.28 8.13 34.91 8.41L34.91 8.41L34.91 8.41Q34.54 8.68 34.41 9.16L34.41 9.16L34.41 9.16Q34.27 9.60 34.27 10.40L34.27 10.40L34.27 10.40Q34.27 11.17 34.40 11.65L34.40 11.65L34.40 11.65Q34.54 12.14 34.90 12.43L34.90 12.43L34.90 12.43Q35.27 12.71 35.81 12.71L35.81 12.71L35.81 12.71Q36.34 12.71 36.73 12.44L36.73 12.44L36.73 12.44Q37.11 12.17 37.23 11.72L37.23 11.72L37.24 11.65L37.24 11.65L37.24 11.65Q37.25 11.58 37.33 11.51L37.33 11.51L37.33 11.51Q37.41 11.44 37.51 11.45L37.51 11.45L38.67 11.63L38.67 11.63Q38.85 11.68 38.85 11.83L38.85 11.83L38.85 11.83Q38.85 11.91 38.79 12.17L38.79 12.17L38.79 12.17Q38.53 13.06 37.72 13.59L37.72 13.59L37.72 13.59Q36.90 14.11 35.81 14.11L35.81 14.11Z" />
                      </g>
                      <g id="233cd3fa-998d-4726-90d6-b8957ce2c522" transform="matrix(1,0,0,1,-19.373001098632812,-5)" stroke="none" fill="black">
                        <path d="M31.91 50.385a.964.964 0 0 0 1.229 1.24l9.749-3.441a19.644 19.644 0 0 0 7.819 1.613c10.397 0 18.855-7.951 18.855-17.725 0-9.774-8.459-17.725-18.855-17.725s-18.855 7.951-18.855 17.725c0 3.505 1.089 6.88 3.155 9.797l-3.097 8.516zm27.672-19.651a2.28 2.28 0 1 1 0 4.56 2.28 2.28 0 0 1 0-4.56zm-8.875 0a2.28 2.28 0 1 1 0 4.56 2.28 2.28 0 0 1 0-4.56zm-8.875 0a2.28 2.28 0 1 1 0 4.56 2.28 2.28 0 0 1 0-4.56z" />
                        <path d="M27.595 63.134c0 8.785 7.147 15.932 15.932 15.932h1.995V95h34.851V34.931c0-7.996-3.115-15.514-8.771-21.167C65.946 8.113 58.428 5 50.43 5h-.87c-7.993 0-15.509 3.112-21.162 8.763-5.656 5.653-8.771 13.171-8.771 21.168v27.702h7.967v.501zm-4.986-3.482V34.931c0-7.201 2.805-13.969 7.897-19.06 5.091-5.088 11.857-7.89 19.053-7.89h.871c7.202 0 13.972 2.802 19.064 7.892 5.092 5.09 7.897 11.858 7.897 19.058v57.088H48.503V76.084h-4.976c-7.141 0-12.95-5.809-12.95-12.95v-3.482h-7.968z" />
                      </g>
                    </motion.svg>
                  </li>
                  <li className="mt-4 list-none flex items-center rounded-[9px] text-gray-900 py-[2px]">
                    <svg
                      className="h-4 w-4 text-gray-700"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      {" "}
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M4.75 6.75C4.75 5.64543 5.64543 4.75 6.75 4.75H17.25C18.3546 4.75 19.25 5.64543 19.25 6.75V17.25C19.25 18.3546 18.3546 19.25 17.25 19.25H6.75C5.64543 19.25 4.75 18.3546 4.75 17.25V6.75Z"
                      ></path>{" "}
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M9.75 8.75V19"
                      ></path>{" "}
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M5 8.25H19"
                      ></path>{" "}
                    </svg>
                    <p className="ml-[3px] mr-[6px]">Home</p>
                  </li>
                  <li className="mt-1 list-none flex items-center rounded-[9px] text-gray-900 py-[4px]">
                    <svg
                      fill="none"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-gray-700"
                    >
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M4.75 6.75C4.75 5.64543 5.64543 4.75 6.75 4.75H17.25C18.3546 4.75 19.25 5.64543 19.25 6.75V17.25C19.25 18.3546 18.3546 19.25 17.25 19.25H6.75C5.64543 19.25 4.75 18.3546 4.75 17.25V6.75Z"
                      ></path>
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M15.25 12L9.75 8.75V15.25L15.25 12Z"
                      ></path>
                    </svg>
                    <p className="ml-[3px] mr-[6px]">Interview Vault</p>
                    <div className="ml-auto text-[#121217] transform">
                      <svg
                        width="24"
                        height="24"
                        fill="none"
                        viewBox="0 0 24 24"
                        className="w-3 h-3 stroke-current fill-transparent rotate-180 transform"
                      >
                        <path
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M15.25 10.75L12 14.25L8.75 10.75"
                        ></path>
                      </svg>
                    </div>
                  </li>
                  <li className="mt-1 list-none flex items-center rounded-[3px] relative bg-white text-gray-600 w-full m-0 cursor-pointer hover:bg-[#F7F7F8] focus:outline-none py-[4px]">
                    <div className="bg-[#e8e8ed] pointer-events-none absolute left-[7px] z-10 top-1/2 h-[3px] w-[3px] rounded-full transform -translate-y-1/2"></div>
                    <div className="text-gray-600 truncate pr-4 pl-[18px]">
                      All Interviews
                    </div>
                    <div className="absolute w-[1px] bg-[#e8e8ed] left-[8px] top-[9px] bottom-0"></div>
                  </li>
                  <li className="list-none flex items-center rounded-[3px] relative bg-white text-gray-600 w-full m-0 cursor-pointer hover:bg-[#F7F7F8] focus:outline-none py-[4px]">
                    <div className="bg-[#e8e8ed] pointer-events-none absolute left-[7px] z-10 top-1/2 h-[3px] w-[3px] rounded-full transform -translate-y-1/2"></div>
                    <div className="text-gray-600 truncate pr-4 pl-[18px]">
                      Completed
                    </div>
                    <div className="absolute w-[1px] bg-[#e8e8ed] left-[8px] top-0 bottom-0"></div>
                  </li>
                  <li className="list-none flex items-center rounded-[3px] relative bg-gray-100 text-gray-600 w-full m-0 cursor-pointer hover:bg-[#F7F7F8] focus:outline-none py-[4px]">
                    <div className="bg-blue-600 pointer-events-none absolute left-[7px] z-10 top-1/2 h-[3px] w-[3px] rounded-full transform -translate-y-1/2"></div>
                    <div className="text-blue-600 truncate pr-4 pl-[18px]">
                      Question Bank
                    </div>
                    <div className="absolute w-[1px] bg-[#e8e8ed] left-[8px] top-0 bottom-[9px]"></div>
                  </li>
                  <li className="mt-1 list-none flex items-center rounded-[9px] text-gray-900 py-[4px]">
                    <svg
                      className="h-4 w-4 text-gray-700"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M4.75 6.75C4.75 5.64543 5.64543 4.75 6.75 4.75H17.25C18.3546 4.75 19.25 5.64543 19.25 6.75V17.25C19.25 18.3546 18.3546 19.25 17.25 19.25H6.75C5.64543 19.25 4.75 18.3546 4.75 17.25V6.75Z"
                      ></path>
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M19 12L5 12"
                      ></path>
                    </svg>
                    <p className="ml-[3px] mr-[6px]">My Questions</p>
                  </li>
                  <li className="mt-1 list-none flex items-center rounded-[9px] text-gray-900 py-[4px]">
                    <svg
                      className="h-4 w-4 text-gray-700"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M5.78168 19.25H13.2183C13.7828 19.25 14.227 18.7817 14.1145 18.2285C13.804 16.7012 12.7897 14 9.5 14C6.21031 14 5.19605 16.7012 4.88549 18.2285C4.773 18.7817 5.21718 19.25 5.78168 19.25Z"
                      ></path>
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M15.75 14C17.8288 14 18.6802 16.1479 19.0239 17.696C19.2095 18.532 18.5333 19.25 17.6769 19.25H16.75"
                      ></path>
                      <circle
                        cx="9.5"
                        cy="7.5"
                        r="2.75"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      ></circle>
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M14.75 10.25C16.2688 10.25 17.25 9.01878 17.25 7.5C17.25 5.98122 16.2688 4.75 14.75 4.75"
                      ></path>
                    </svg>
                    <p className="ml-[3px] mr-[6px]">Community</p>
                  </li>
                  <li className="mt-1 list-none flex items-center rounded-[9px] text-gray-900 py-[4px]">
                    <svg
                      className="h-4 w-4 text-gray-700"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M19.25 5.75C19.25 5.19772 18.8023 4.75 18.25 4.75H14C12.8954 4.75 12 5.64543 12 6.75V19.25L12.8284 18.4216C13.5786 17.6714 14.596 17.25 15.6569 17.25H18.25C18.8023 17.25 19.25 16.8023 19.25 16.25V5.75Z"
                      ></path>
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M4.75 5.75C4.75 5.19772 5.19772 4.75 5.75 4.75H10C11.1046 4.75 12 5.64543 12 6.75V19.25L11.1716 18.4216C10.4214 17.6714 9.40401 17.25 8.34315 17.25H5.75C5.19772 17.25 4.75 16.8023 4.75 16.25V5.75Z"
                      ></path>
                    </svg>
                    <p className="ml-[3px] mr-[6px]">Resources</p>
                  </li>
                  <li className="mt-1 list-none flex items-center rounded-[9px] text-gray-900 py-[4px]">
                    <svg
                      className="h-4 w-4 text-gray-700"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M13.1191 5.61336C13.0508 5.11856 12.6279 4.75 12.1285 4.75H11.8715C11.3721 4.75 10.9492 5.11856 10.8809 5.61336L10.7938 6.24511C10.7382 6.64815 10.4403 6.96897 10.0622 7.11922C10.006 7.14156 9.95021 7.16484 9.89497 7.18905C9.52217 7.3524 9.08438 7.3384 8.75876 7.09419L8.45119 6.86351C8.05307 6.56492 7.49597 6.60451 7.14408 6.9564L6.95641 7.14408C6.60452 7.49597 6.56492 8.05306 6.86351 8.45118L7.09419 8.75876C7.33841 9.08437 7.3524 9.52216 7.18905 9.89497C7.16484 9.95021 7.14156 10.006 7.11922 10.0622C6.96897 10.4403 6.64815 10.7382 6.24511 10.7938L5.61336 10.8809C5.11856 10.9492 4.75 11.372 4.75 11.8715V12.1285C4.75 12.6279 5.11856 13.0508 5.61336 13.1191L6.24511 13.2062C6.64815 13.2618 6.96897 13.5597 7.11922 13.9378C7.14156 13.994 7.16484 14.0498 7.18905 14.105C7.3524 14.4778 7.3384 14.9156 7.09419 15.2412L6.86351 15.5488C6.56492 15.9469 6.60451 16.504 6.9564 16.8559L7.14408 17.0436C7.49597 17.3955 8.05306 17.4351 8.45118 17.1365L8.75876 16.9058C9.08437 16.6616 9.52216 16.6476 9.89496 16.811C9.95021 16.8352 10.006 16.8584 10.0622 16.8808C10.4403 17.031 10.7382 17.3519 10.7938 17.7549L10.8809 18.3866C10.9492 18.8814 11.3721 19.25 11.8715 19.25H12.1285C12.6279 19.25 13.0508 18.8814 13.1191 18.3866L13.2062 17.7549C13.2618 17.3519 13.5597 17.031 13.9378 16.8808C13.994 16.8584 14.0498 16.8352 14.105 16.8109C14.4778 16.6476 14.9156 16.6616 15.2412 16.9058L15.5488 17.1365C15.9469 17.4351 16.504 17.3955 16.8559 17.0436L17.0436 16.8559C17.3955 16.504 17.4351 15.9469 17.1365 15.5488L16.9058 15.2412C16.6616 14.9156 16.6476 14.4778 16.811 14.105C16.8352 14.0498 16.8584 13.994 16.8808 13.9378C17.031 13.5597 17.3519 13.2618 17.7549 13.2062L18.3866 13.1191C18.8814 13.0508 19.25 12.6279 19.25 12.1285V11.8715C19.25 11.3721 18.8814 10.9492 18.3866 10.8809L17.7549 10.7938C17.3519 10.7382 17.031 10.4403 16.8808 10.0622C16.8584 10.006 16.8352 9.95021 16.8109 9.89496C16.6476 9.52216 16.6616 9.08437 16.9058 8.75875L17.1365 8.4512C17.4351 8.05308 17.3955 7.49599 17.0436 7.1441L16.8559 6.95642C16.504 6.60453 15.9469 6.56494 15.5488 6.86353L15.2412 7.09419C14.9156 7.33841 14.4778 7.3524 14.105 7.18905C14.0498 7.16484 13.994 7.14156 13.9378 7.11922C13.5597 6.96897 13.2618 6.64815 13.2062 6.24511L13.1191 5.61336Z"
                      ></path>
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M13.25 12C13.25 12.6904 12.6904 13.25 12 13.25C11.3096 13.25 10.75 12.6904 10.75 12C10.75 11.3096 11.3096 10.75 12 10.75C12.6904 10.75 13.25 11.3096 13.25 12Z"
                      ></path>
                    </svg>
                    <p className="ml-[3px] mr-[6px]">Settings</p>
                  </li>
                </ul>
                <ul className="flex flex-col mb-[10px]">
                  <hr className="border-[#e8e8ed] w-full" />
                  <li className="mt-1 list-none flex items-center rounded-[9px] text-gray-900 py-[2px]">
                    <div className="h-4 w-4 bg-[#898FA9] rounded-full flex-shrink-0 text-white inline-flex items-center justify-center text-[7px] leading-[6px] pl-[0.5px]">
                      R
                    </div>
                    <p className="ml-[4px] mr-[6px] flex-shrink-0">
                      Alan Poensgen
                    </p>
                    <div className="ml-auto">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M13 12C13 12.5523 12.5523 13 12 13C11.4477 13 11 12.5523 11 12C11 11.4477 11.4477 11 12 11C12.5523 11 13 11.4477 13 12Z"
                        ></path>
                        <path
                          fill="currentColor"
                          d="M9 12C9 12.5523 8.55228 13 8 13C7.44772 13 7 12.5523 7 12C7 11.4477 7.44772 11 8 11C8.55228 11 9 11.4477 9 12Z"
                        ></path>
                        <path
                          fill="currentColor"
                          d="M17 12C17 12.5523 16.5523 13 16 13C15.4477 13 15 12.5523 15 12C15 11.4477 15.4477 11 16 11C16.5523 11 17 11.4477 17 12Z"
                        ></path>
                      </svg>
                    </div>
                  </li>
                </ul>
              </div>
              <div className="bg-white text-[#667380] p-[18px] flex flex-col">
                {step === 1 ? (
                  <div>
                    <motion.span
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                      key={selected.id}
                      className="text-[#1a2b3b] text-[14px] leading-[18px] font-semibold absolute"
                    >
                      {selected.name} Questions
                    </motion.span>

                    <ul className="mt-[28px] flex">
                      <li className="list-none max-w-[400px]">
                        Search through all of the questions in the question
                        bank. If you don{`'`}t see one you{`'`}re looking for,
                        you can always add it in your the {`"`}My Questions{`"`}{" "}
                        section.
                      </li>
                    </ul>
                  </div>
                ) : (
                  <div>
                    <motion.span
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                      key={selected.id}
                      className="text-[#1a2b3b] text-[14px] leading-[18px] font-semibold absolute"
                    >
                      Explain how would you bring your product to market...
                      {/* {selected.name === "Behavioral"
                        ? "PEI: Tell me about a time when you led a team through a difficult situation."
                        : "Explain how would you bring your product to market..."} */}
                    </motion.span>

                    <ul className="mt-[28px] flex">
                      {selected.name === "Behavioral" ? (
                        <li className="list-none max-w-[400px]">
                          Start off by walking me through your resume. Perhaps
                          begin with your internships in college and move to
                          more recent projects.
                        </li>
                      ) : (
                        <li className="list-none max-w-[400px]">
                          Lay out the structure of the case.
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                {step === 1 && (
                  <ul className="mt-[12px] flex items-center space-x-[2px]">
                    <svg
                      className="w-4 h-4 text-[#1a2b3b]"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M19.25 19.25L15.5 15.5M4.75 11C4.75 7.54822 7.54822 4.75 11 4.75C14.4518 4.75 17.25 7.54822 17.25 11C17.25 14.4518 14.4518 17.25 11 17.25C7.54822 17.25 4.75 14.4518 4.75 11Z"
                      ></path>
                    </svg>

                    <p>Search</p>
                  </ul>
                )}
                {step === 1 &&
                  (selected.name === "Antler IC" ? (
                    <motion.ul
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                      key={selected.id}
                      className="mt-3 grid grid-cols-3 xl:grid-cols-3 gap-2"
                    >
                      <li className="list-none relative flex items-stretch text-left">
                        <div className="group relative w-full">
                          <div className="relative mb-2 flex h-full max-h-[200px] w-full cursor-pointer items-start justify-between rounded-lg p-2 font-medium transition duration-100">
                            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-zinc-900/[7.5%] group-hover:ring-zinc-900/10"></div>
                            <div className="relative flex h-full flex-col overflow-hidden">
                              <div className="flex items-center text-left text-[#1a2b3b]">
                                <p>What is the Go-To-Market strategy?</p>
                              </div>
                              <p className="text-wrap grow font-normal text-[7px]">
                                What is the business plan?
                              </p>
                              <div className="flex flex-row space-x-1">
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-gray-300 px-[3px] text-[7px] font-normal hover:bg-gray-50">
                                  Strategy
                                </p>
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-[#D0E7DC] bg-[#F3FAF1] px-[3px] text-[7px] font-normal hover:bg-[#edf8ea]">
                                  <span className="mr-1 flex items-center text-emerald-600">
                                    <svg
                                      className="h-2 w-2"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12Z"
                                        fill="#459A5F"
                                        stroke="#459A5F"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                      <path
                                        d="M9.75 12.75L10.1837 13.6744C10.5275 14.407 11.5536 14.4492 11.9564 13.7473L14.25 9.75"
                                        stroke="#F4FAF4"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                    </svg>
                                  </span>
                                  Completed
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                      <li className="list-none relative flex items-stretch text-left">
                        <div className="group relative w-full">
                          <div className="relative mb-2 flex h-full max-h-[200px] w-full cursor-pointer items-start justify-between rounded-lg p-2 font-medium transition duration-100">
                            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-zinc-900/[7.5%] group-hover:ring-zinc-900/10"></div>
                            <div className="relative flex h-full flex-col overflow-hidden">
                              <div className="flex items-center text-left text-[#1a2b3b]">
                                <p>How would you expand?</p>
                              </div>
                              <p className="text-wrap grow font-normal text-[7px]">
                                Tell me about the expansion plan in 2 years.
                              </p>
                              <div className="flex flex-row space-x-1">
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-gray-300 px-[3px] text-[7px] font-normal hover:bg-gray-50">
                                  Business
                                </p>
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-[#D0E7DC] bg-[#F3FAF1] px-[3px] text-[7px] font-normal hover:bg-[#edf8ea]">
                                  <span className="mr-1 flex items-center text-emerald-600">
                                    <svg
                                      className="h-2 w-2"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12Z"
                                        fill="#459A5F"
                                        stroke="#459A5F"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                      <path
                                        d="M9.75 12.75L10.1837 13.6744C10.5275 14.407 11.5536 14.4492 11.9564 13.7473L14.25 9.75"
                                        stroke="#F4FAF4"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                    </svg>
                                  </span>
                                  Completed
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                      <li className="list-none relative flex items-stretch text-left">
                        <div className="group relative w-full">
                          <div className="relative mb-2 flex h-full max-h-[200px] w-full cursor-pointer items-start justify-between rounded-lg p-2 font-medium transition duration-100">
                            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-zinc-900/[7.5%] group-hover:ring-zinc-900/10"></div>
                            <div className="relative flex h-full flex-col overflow-hidden">
                              <div className="flex items-center text-left text-[#1a2b3b]">
                                <p>Tell me about the company</p>
                              </div>
                              <p className="text-wrap grow font-normal text-[7px]">
                                Walk me through your team resume, projects, and
                                anything you feel is relevant to your story.
                              </p>
                              <div className="flex flex-row space-x-1">
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-gray-300 px-[3px] text-[7px] font-normal hover:bg-gray-50">
                                  Product Management
                                </p>
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-[#D0E7DC] bg-[#F3FAF1] px-[3px] text-[7px] font-normal hover:bg-[#edf8ea]">
                                  <span className="mr-1 flex items-center text-emerald-600">
                                    <svg
                                      className="h-2 w-2"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12Z"
                                        fill="#459A5F"
                                        stroke="#459A5F"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                      <path
                                        d="M9.75 12.75L10.1837 13.6744C10.5275 14.407 11.5536 14.4492 11.9564 13.7473L14.25 9.75"
                                        stroke="#F4FAF4"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                    </svg>
                                  </span>
                                  Completed
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                      <li className="list-none relative flex items-stretch text-left">
                        <div className="group relative w-full">
                          <div className="relative mb-2 flex h-full max-h-[200px] w-full cursor-pointer items-start justify-between rounded-lg p-2 font-medium transition duration-100">
                            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-zinc-900/[7.5%] group-hover:ring-zinc-900/10"></div>
                            <div className="relative flex h-full flex-col overflow-hidden">
                              <div className="flex items-center text-left text-[#1a2b3b]">
                                <p>Explain the product.</p>
                              </div>
                              <p className="text-wrap grow font-normal text-[7px]">
                                Tell me about your product and why customers needs it.<br />
                                What is the Unique Selling Value?
                              </p>
                              <div className="flex flex-row space-x-1">
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-gray-300 px-[3px] text-[7px] font-normal hover:bg-gray-50">
                                  Product Management
                                </p>
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-[#D0E7DC] bg-[#F3FAF1] px-[3px] text-[7px] font-normal hover:bg-[#edf8ea]">
                                  <span className="mr-1 flex items-center text-emerald-600">
                                    <svg
                                      className="h-2 w-2"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12Z"
                                        fill="#459A5F"
                                        stroke="#459A5F"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                      <path
                                        d="M9.75 12.75L10.1837 13.6744C10.5275 14.407 11.5536 14.4492 11.9564 13.7473L14.25 9.75"
                                        stroke="#F4FAF4"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                    </svg>
                                  </span>
                                  Completed
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                      <li className="list-none relative flex items-stretch text-left">
                        <div className="group relative w-full">
                          <div className="relative mb-2 flex h-full max-h-[200px] w-full cursor-pointer items-start justify-between rounded-lg p-2 font-medium transition duration-100">
                            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-zinc-900/[7.5%] group-hover:ring-zinc-900/10"></div>
                            <div className="relative flex h-full flex-col overflow-hidden">
                              <div className="flex items-center text-left text-[#1a2b3b]">
                                <p>What are your weaknesses?</p>
                              </div>
                              <p className="text-wrap grow font-normal text-[7px]">
                                Tell me about your weaknesses, and how that has
                                impacted your previous work.
                              </p>
                              <div className="flex flex-row space-x-1">
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-gray-300 px-[3px] text-[7px] font-normal hover:bg-gray-50">
                                  Product Management
                                </p>
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-[#D0E7DC] bg-[#F3FAF1] px-[3px] text-[7px] font-normal hover:bg-[#edf8ea]">
                                  <span className="mr-1 flex items-center text-emerald-600">
                                    <svg
                                      className="h-2 w-2"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12Z"
                                        fill="#459A5F"
                                        stroke="#459A5F"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                      <path
                                        d="M9.75 12.75L10.1837 13.6744C10.5275 14.407 11.5536 14.4492 11.9564 13.7473L14.25 9.75"
                                        stroke="#F4FAF4"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                    </svg>
                                  </span>
                                  Completed
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    </motion.ul>
                  ) : (
                    <motion.ul
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                      key={selected.id}
                      className="mt-3 grid grid-cols-3 xl:grid-cols-3 gap-2"
                    >
                      <li className="list-none relative flex items-stretch text-left">
                        <div className="group relative w-full">
                          <div className="relative mb-2 flex h-full max-h-[200px] w-full cursor-pointer items-start justify-between rounded-lg p-2 font-medium transition duration-100">
                            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-zinc-900/[7.5%] group-hover:ring-zinc-900/10"></div>
                            <div className="relative flex h-full flex-col overflow-hidden">
                              <div className="flex items-center text-left text-[#1a2b3b]">
                                <p>Walk me through this function</p>
                              </div>
                              <p className="text-wrap grow font-normal text-[7px]">
                                Explain in as much detail as you can what this
                                function does, including its time and space...
                              </p>
                              <div className="flex flex-row space-x-1">
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-gray-300 px-[3px] text-[7px] font-normal hover:bg-gray-50">
                                  Software Engineering
                                </p>
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-[#D0E7DC] bg-[#F3FAF1] px-[3px] text-[7px] font-normal hover:bg-[#edf8ea]">
                                  <span className="mr-1 flex items-center text-emerald-600">
                                    <svg
                                      className="h-2 w-2"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12Z"
                                        fill="#459A5F"
                                        stroke="#459A5F"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                      <path
                                        d="M9.75 12.75L10.1837 13.6744C10.5275 14.407 11.5536 14.4492 11.9564 13.7473L14.25 9.75"
                                        stroke="#F4FAF4"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                    </svg>
                                  </span>
                                  Completed
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                      <li className="list-none relative flex items-stretch text-left">
                        <div className="group relative w-full">
                          <div className="relative mb-2 flex h-full max-h-[200px] w-full cursor-pointer items-start justify-between rounded-lg p-2 font-medium transition duration-100">
                            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-zinc-900/[7.5%] group-hover:ring-zinc-900/10"></div>
                            <div className="relative flex h-full flex-col overflow-hidden">
                              <div className="flex items-center text-left text-[#1a2b3b]">
                                <p>Uber product expansion</p>
                              </div>
                              <p className="text-wrap grow font-normal text-[7px]">
                                Uber is looking to expand its product line and
                                wants your take on how...
                              </p>
                              <div className="flex flex-row space-x-1">
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-gray-300 px-[3px] text-[7px] font-normal hover:bg-gray-50">
                                  Product Management
                                </p>
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-[#D0E7DC] bg-[#F3FAF1] px-[3px] text-[7px] font-normal hover:bg-[#edf8ea]">
                                  <span className="mr-1 flex items-center text-emerald-600">
                                    <svg
                                      className="h-2 w-2"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12Z"
                                        fill="#459A5F"
                                        stroke="#459A5F"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                      <path
                                        d="M9.75 12.75L10.1837 13.6744C10.5275 14.407 11.5536 14.4492 11.9564 13.7473L14.25 9.75"
                                        stroke="#F4FAF4"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                    </svg>
                                  </span>
                                  Completed
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                      <li className="list-none relative flex items-stretch text-left">
                        <div className="group relative w-full">
                          <div className="relative mb-2 flex h-full max-h-[200px] w-full cursor-pointer items-start justify-between rounded-lg p-2 font-medium transition duration-100">
                            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-zinc-900/[7.5%] group-hover:ring-zinc-900/10"></div>
                            <div className="relative flex h-full flex-col overflow-hidden">
                              <div className="flex items-center text-left text-[#1a2b3b]">
                                <p>Weighing an Airplane</p>
                              </div>
                              <p className="text-wrap grow font-normal text-[7px]">
                                How would you weigh a plane without a scale?
                              </p>
                              <div className="flex flex-row space-x-1">
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-gray-300 px-[3px] text-[7px] font-normal hover:bg-gray-50">
                                  Brainteaser
                                </p>
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-[#D0E7DC] bg-[#F3FAF1] px-[3px] text-[7px] font-normal hover:bg-[#edf8ea]">
                                  <span className="mr-1 flex items-center text-emerald-600">
                                    <svg
                                      className="h-2 w-2"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12Z"
                                        fill="#459A5F"
                                        stroke="#459A5F"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                      <path
                                        d="M9.75 12.75L10.1837 13.6744C10.5275 14.407 11.5536 14.4492 11.9564 13.7473L14.25 9.75"
                                        stroke="#F4FAF4"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                    </svg>
                                  </span>
                                  Completed
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                      <li className="list-none relative flex items-stretch text-left">
                        <div className="group relative w-full">
                          <div className="relative mb-2 flex h-full max-h-[200px] w-full cursor-pointer items-start justify-between rounded-lg p-2 font-medium transition duration-100">
                            <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-zinc-900/[7.5%] group-hover:ring-zinc-900/10"></div>
                            <div className="relative flex h-full flex-col overflow-hidden">
                              <div className="flex items-center text-left text-[#1a2b3b]">
                                <p>How should Uber enter the Indian market?</p>
                              </div>
                              <p className="text-wrap grow font-normal text-[7px]">
                                Given what you know about Uber, how would you
                                structure the market entry?
                              </p>
                              <div className="flex flex-row space-x-1">
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-gray-300 px-[3px] text-[7px] font-normal hover:bg-gray-50">
                                  Market Entry
                                </p>
                                <p className="inline-flex items-center justify-center truncate rounded-full border-[0.5px] border-[#D0E7DC] bg-[#F3FAF1] px-[3px] text-[7px] font-normal hover:bg-[#edf8ea]">
                                  <span className="mr-1 flex items-center text-emerald-600">
                                    <svg
                                      className="h-2 w-2"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M4.75 12C4.75 7.99594 7.99594 4.75 12 4.75C16.0041 4.75 19.25 7.99594 19.25 12C19.25 16.0041 16.0041 19.25 12 19.25C7.99594 19.25 4.75 16.0041 4.75 12Z"
                                        fill="#459A5F"
                                        stroke="#459A5F"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                      <path
                                        d="M9.75 12.75L10.1837 13.6744C10.5275 14.407 11.5536 14.4492 11.9564 13.7473L14.25 9.75"
                                        stroke="#F4FAF4"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      ></path>
                                    </svg>
                                  </span>
                                  Completed
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    </motion.ul>
                  ))}
                {step === 1 && (
                  <div className="space-y-2 md:space-y-5 mt-auto">
                    <nav
                      className="flex items-center justify-between border-t border-gray-200 bg-white px-1 py-[2px] mb-[10px]"
                      aria-label="Pagination"
                    >
                      <div className="hidden sm:block">
                        <p className=" text-[#1a2b3b]">
                          Showing <span className="font-medium">1</span> to{" "}
                          <span className="font-medium">9</span> of{" "}
                          <span className="font-medium">500</span> results
                        </p>
                      </div>
                      <div className="flex flex-1 justify-between sm:justify-end">
                        <button className="relative inline-flex cursor-auto items-center rounded border border-gray-300 bg-white px-[4px] py-[2px]  font-medium text-[#1a2b3b] hover:bg-gray-50 disabled:opacity-50">
                          Previous
                        </button>
                        <button className="relative ml-3 inline-flex items-center rounded border border-gray-300 bg-white px-[4px] py-[2px]  font-medium text-[#1a2b3b] hover:bg-gray-50">
                          Next
                        </button>
                      </div>
                    </nav>
                  </div>
                )}
              </div>
            </figure>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
