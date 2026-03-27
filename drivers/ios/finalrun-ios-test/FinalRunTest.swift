import XCTest
import os.log

private let logger = OSLog(subsystem: "app.finalrun.ios", category: "GrpcTest")

class FinalRunTest: XCTestCase {
    nonisolated(unsafe) private static var swizzledOutIdle = false

    override func setUpWithError() throws {
        // XCTest internals sometimes use XCTAssert* instead of exceptions.
        // Setting `continueAfterFailure` so that the xctest runner does not stop
        // when an XCTest internal error happens.
    }
    
    @objc func replace_waitForQuiescenceIncludingAnimationsIdle() {
        return
    }
    
    /// Main test entry point - starts gRPC server (requires iOS 18+)
    @available(iOS 18.0, *)
    @MainActor
    func testDriver() async throws {
        os_log("=== testDriver: STARTING ===", log: logger, type: .error)
        
        // When launched via simctl launch with SIMCTL_CHILD_port=XXXX,
        // the env var is available as just "port" (prefix is stripped)
        // When launched via xcodebuild test, it's "TEST_RUNNER_port"
        let portString = ProcessInfo.processInfo.environment["port"]
            ?? ProcessInfo.processInfo.environment["TEST_RUNNER_port"]
        
        let port: Int
        if let portString = portString, let parsedPort = Int(portString) {
            port = parsedPort
            os_log("=== testDriver: Using port %d ===", log: logger, type: .error, port)
        } else {
            port = 6100
            os_log("=== testDriver: No port passed, using default 6100 ===", log: logger, type: .error)
        }
        
        let server = GrpcDriverServer(port: port)
        
        do {
            os_log("=== testDriver: Calling server.start() ===", log: logger, type: .error)
            try await server.start()
            os_log("=== testDriver: server.start() RETURNED (unexpected!) ===", log: logger, type: .error)
        } catch {
            os_log("=== testDriver: server.start() THREW ERROR: %{public}@ ===", log: logger, type: .error, String(describing: error))
        }
        
        // Keep test alive even if server exits - this prevents xcodebuild from terminating
        os_log("=== testDriver: Server ended, entering keep-alive loop ===", log: logger, type: .error)
        while true {
            try? await Task.sleep(nanoseconds: 10_000_000_000) // 10 seconds
            os_log("=== testDriver: Keep-alive heartbeat ===", log: logger, type: .error)
        }
    }
}
