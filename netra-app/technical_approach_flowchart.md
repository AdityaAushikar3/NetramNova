# NetramNova Proposed Next-Gen Architecture Flowchart

This flowchart outlines the **proposed production-ready architecture** based on our discussion, incorporating the scalability, performance, and explainability improvements (WASM, FastAPI, Grad-CAM++, and ONNX Runtime).

```mermaid
graph TD
    %% Frontend Phase
    subgraph Frontend [1. Client-Side Next.js & WASM]
        USER((User:<br/>Doctor/Tech))
        UPLOAD[Upload Fundus Image]
        
        subgraph MultiViewport [High-Performance Multi-Viewport Engine]
            RAW[Raw Image View]
            PREP_VIEW[Preprocessed View]
            GCAM_VIEW[High-Res Saliency View]
            WASM_RED[WebAssembly OpenCV.js<br/>Real-Time Red-Free Filter]
        end
        
        USER --> UPLOAD
    end

    %% Backend API Phase
    subgraph Backend [2. Node.js API & Queue]
        API_ROUTE{Next.js Edge API}
        QUEUE[(Message Queue<br/>Redis / RabbitMQ)]
        DB[(Local SQLite / IndexedDB<br/>Offline Sync)]
        
        UPLOAD -->|Base64 Image| API_ROUTE
        API_ROUTE -->|Enqueue Task| QUEUE
        API_ROUTE -.->|Sync Data| DB
    end

    %% Decoupled FastAPI / TorchServe Microservice
    subgraph ML_Service [3. Scalable AI Microservice]
        FASTAPI[FastAPI / Triton Gateway<br/>Always-On Service]
        
        QUEUE -->|Fetch Task| FASTAPI
        
        subgraph Preproc [Preprocessing Pipeline]
            CROP[Circular Masking]
            BEN_GRAHAM[Ben Graham Filtering]
        end
        
        FASTAPI --> CROP
        CROP --> BEN_GRAHAM
    end

    %% Upgraded Inference
    subgraph ML_Inference [4. Deep Learning Edge Inference]
        ONNX[ONNX Runtime INT8<br/>EfficientNet-B2 Edge CPU Execution]
        GCAM_PLUS[Grad-CAM++ / HiResCAM<br/>High-Resolution Saliency Map]
        
        BEN_GRAHAM --> ONNX
        ONNX -- "Raw Probabilities" --> GCAM_PLUS
    end

    %% Clinical Audit Engine
    subgraph ML_Audit [5. Deterministic Clinical Audit]
        BLOB[Lesion Extraction<br/>Thresholding High-Res CAM]
        QUAD[ETDRS Quadrant Mapping]
        
        subgraph Rules [Deterministic Override Rules]
            RULE_MA[Rule 1: MA Rescue<br/>Normal -> Mild]
            RULE_ETDRS[Rule 2: ETDRS Rule 4<br/>Moderate -> Severe]
        end
        
        GCAM_PLUS --> BLOB
        BLOB --> QUAD
        QUAD --> RULE_MA
        QUAD --> RULE_ETDRS
    end

    %% Output Phase
    subgraph Output [6. Response & Rendering]
        JSON[JSON Payload<br/>Audited Grade, High-Res Bounding Boxes]
        
        RULE_MA --> JSON
        RULE_ETDRS --> JSON
        
        JSON -- "HTTP Response" --> FASTAPI
        FASTAPI -- "Fulfills Task" --> QUEUE
        QUEUE -- "Returns Payload" --> API_ROUTE
        API_ROUTE --> MultiViewport
    end
    
    %% Styling
    classDef frontend fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff;
    classDef backend fill:#1e293b,stroke:#10b981,stroke-width:2px,color:#fff;
    classDef ml fill:#334155,stroke:#f43f5e,stroke-width:2px,color:#fff;
    classDef highlight fill:#7c3aed,stroke:#c4b5fd,stroke-width:3px,color:#fff;
    
    class Frontend,MultiViewport frontend;
    class Backend backend;
    class ML_Service,ML_Inference,ML_Audit,Preproc ml;
    class WASM_RED,QUEUE,FASTAPI,ONNX,GCAM_PLUS highlight;
```

### Key Improvements in this Proposed Flow:

1. **WebAssembly (WASM) Frontend Integration**: Instead of heavy JavaScript Canvas loops, the UI uses `OpenCV.js` (WASM) to process the structural Red-Free view at near-native C++ speeds, preventing stuttering on low-end clinic tablets.
2. **Message Queue / FastAPI Decoupling**: The architecture now routes inference jobs through a Message Queue (like Redis) into a highly scalable `FastAPI` or `Triton` gateway, rather than direct synchronous HTTP requests. This prevents server crashes during traffic spikes.
3. **ONNX Edge CPU Inference**: The CNN is explicitly ported to run on `ONNX Runtime` with INT8 quantization, massively speeding up processing on cheap clinic hardware without needing GPUs.
4. **Grad-CAM++ / HiResCAM**: Standard Grad-CAM is replaced with high-resolution explainability algorithms, fixing the issue where tiny Microaneurysms get lost in blurry heatmaps and ensuring the Clinical Audit engine has perfect spatial coordinates.
