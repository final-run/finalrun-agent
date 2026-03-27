//
//  XCTestResponse.swift
//  finalrun-ios-test
//
//  Created by Ajay S on 22/02/24.
//

import Foundation

struct ActionResponse: Codable {
    let requestId: String?
    let type: String?
    let success: Bool
    let message: String?
    let data: ActionResponseData?
}

struct ActionResponseData: Codable {
    let type: String
    let screenshot: String?
    let screenWidth: Int?
    let screenHeight: Int?
    let hierarchy: String?
    let orientation: String?
    let x: Int?
    let y: Int?
    let scale: Float?
}

// Define a model conforming to Codable protocol
//struct XCTestResponse: Codable {
//    let action: String?
//    let response: ResponseData?
//}
//
//struct ResponseData: Codable {
//    let stepId: String?
//    let testId: String?
//    let testExecutionId: String?
//    let testGroupId: String?
//    let success: Bool?
//    let code: Int?
//    let message: String?
//    let screenshot: String?
//    let failedReason: String?
//    let node_bounds: XCBounds?
//    let screenHeight: Int?
//    let screenWidth: Int?
//}
//
//struct FailedReason: Codable {
//    let type: String?
//    let message: String?
//    let matched: [String]?
//    let unmatched: [String]?
//    
//    func toString() -> String {
//        let encoder = JSONEncoder()
//        encoder.outputFormatting = .prettyPrinted
//        do {
//            let jsonData = try encoder.encode(self)
//            return String(data: jsonData, encoding: .utf8) ?? "Invalid JSON format"
//        } catch {
//            return "Error encoding to JSON: \(error)"
//        }
//    }
//}
