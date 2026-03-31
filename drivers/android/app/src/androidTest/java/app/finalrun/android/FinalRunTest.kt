package app.finalrun.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.finalrun.android.grpc.GrpcDriverServer
import org.junit.Test
import org.junit.runner.RunWith

/**
 * This class is started by the command line, to check more refer run_instrumentation_test.sh
 */
private const val PORT = "port"

@RunWith(AndroidJUnit4::class)
class FinalRunTest {

    /**
     * Main test entry point - starts gRPC server
     */
    @Test
    fun testDriver() {
        debugLog(msg = "Starting gRPC Server...")
        startGrpcServer()

        // Keep the test running
        while (!Thread.interrupted()) {
            Thread.sleep(100)
        }
    }

    private fun startGrpcServer() {
        val arguments = InstrumentationRegistry.getArguments()
        val port = arguments.getString(PORT)?.toIntOrNull() ?: 7001
        debugLog(msg = "gRPC: Starting on port $port")
        GrpcDriverServer.start(port)
    }
}