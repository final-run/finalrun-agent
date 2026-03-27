//
//  XCTestManager.swift
//  finalrun-ios-test
//
//  Created by Ajay S on 22/02/24.
//

import Foundation
import XCTest
import os

protocol XCTestDelegate: AnyObject {
    func sendXCTestResponse(jsonString: String, completion: @escaping SuccessCallBack)
}

let constant_executeTestStep = "executeTestStep"

enum XCTestCommand: String {
    case Tap
    case ValidateText = "Validate Text"
    case ValidateElement = "Validate Element"
    case EnterText = "Enter Text"
    case Swipe
    case ScrollUp = "Scroll Up"
    case ScrollDown = "Scroll Down"
    case ScrollLeft = "Scroll Left"
    case ScrollRight = "Scroll Right"
    case VScroll = "V Scroll"
    case HScroll = "H Scroll"
    case HomeScreen = "goToHomeScreen"
    case LockScreen = "lockScreen"
    case Stop = "stopTestExecution"
}

@MainActor
class XCTestManager {
    
    weak var delegate: XCTestDelegate?
    
    private var findNodeTimer: Timer?
    
    private var stopTest = false
    
    private var timeoutStartTime: TimeInterval?
    
    func startTest(withTestRequest testRequest: Action) {
        invalidateTestTimer()
        stopTest = false
        DispatchQueue.main.asyncAfter(deadline: .now()) {
            self.timeoutStartTime = Date().timeIntervalSince1970
            self.prepareForTest(testRequest)
        }
    }
    
    func updateAppIds(updateAppIdAction: UpdateAppIdAction) {
        XCViewHierarchyManager.availableAppIds = updateAppIdAction.appIds
        self.sendTestResponse(withRequestId: updateAppIdAction.requestId, type: updateAppIdAction.type, success: true)
    }
    
    func performHomeAction(_ homeAction: HomeAction) {
        XCUIDevice.shared.press(.home)
        self.sendTestResponse(withRequestId: homeAction.requestId, type: homeAction.type, success: true)
    }
    
    func performPressKeyAction(_ pressKeyAction: PressKeyAction) {
        let keyString = pressKeyAction.key.lowercased()
        var success = false
        var message = ""
        
        // Map key strings to XCUIDevice button presses
        switch keyString {
        case "home":
            XCUIDevice.shared.press(.home)
            success = true
//        case "volumeup", "volume_up":
//            XCUIDevice.shared.press(.volumeUp)
//            success = true
//        case "volumedown", "volume_down":
//            XCUIDevice.shared.press(.volumeDown)
//            success = true
        case "lock":
            // Lock the device
            XCUIDevice.shared.perform(NSSelectorFromString("pressLockButton"))
            success = true
        case "enter", "return":
            // For keyboard keys, we need to type them
            var eventPath = PointerEventPath.pathForTextInput()
            eventPath.typeKey(XCUIKeyboardKey.return.rawValue)
            let eventRecord = EventRecord(orientation: .portrait)
            _ = eventRecord.add(eventPath)
            RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { synthesizeSuccess in
                DispatchQueue.main.async {
                    self.sendTestResponse(withRequestId: pressKeyAction.requestId, type: pressKeyAction.type, success: synthesizeSuccess)
                }
            }
            return // Early return since we're handling async
        case "delete", "backspace":
            // For delete key
            var eventPath = PointerEventPath.pathForTextInput()
            eventPath.typeKey(XCUIKeyboardKey.delete.rawValue)
            let eventRecord = EventRecord(orientation: .portrait)
            _ = eventRecord.add(eventPath)
            RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { synthesizeSuccess in
                DispatchQueue.main.async {
                    self.sendTestResponse(withRequestId: pressKeyAction.requestId, type: pressKeyAction.type, success: synthesizeSuccess)
                }
            }
            return // Early return since we're handling async
        case "tab":
            // For tab key
            var eventPath = PointerEventPath.pathForTextInput()
            eventPath.typeKey(XCUIKeyboardKey.tab.rawValue)
            let eventRecord = EventRecord(orientation: .portrait)
            _ = eventRecord.add(eventPath)
            RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { synthesizeSuccess in
                DispatchQueue.main.async {
                    self.sendTestResponse(withRequestId: pressKeyAction.requestId, type: pressKeyAction.type, success: synthesizeSuccess)
                }
            }
            return // Early return since we're handling async
        case "escape", "esc":
            // For escape key
            var eventPath = PointerEventPath.pathForTextInput()
            eventPath.typeKey(XCUIKeyboardKey.escape.rawValue)
            let eventRecord = EventRecord(orientation: .portrait)
            _ = eventRecord.add(eventPath)
            RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { synthesizeSuccess in
                DispatchQueue.main.async {
                    self.sendTestResponse(withRequestId: pressKeyAction.requestId, type: pressKeyAction.type, success: synthesizeSuccess)
                }
            }
            return // Early return since we're handling async
        case "up", "uparrow", "remote_up":
            // For up arrow
            var eventPath = PointerEventPath.pathForTextInput()
            eventPath.typeKey(XCUIKeyboardKey.upArrow.rawValue)
            let eventRecord = EventRecord(orientation: .portrait)
            _ = eventRecord.add(eventPath)
            RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { synthesizeSuccess in
                DispatchQueue.main.async {
                    self.sendTestResponse(withRequestId: pressKeyAction.requestId, type: pressKeyAction.type, success: synthesizeSuccess)
                }
            }
            return // Early return since we're handling async
        case "down", "downarrow", "remote_down":
            // For down arrow
            var eventPath = PointerEventPath.pathForTextInput()
            eventPath.typeKey(XCUIKeyboardKey.downArrow.rawValue)
            let eventRecord = EventRecord(orientation: .portrait)
            _ = eventRecord.add(eventPath)
            RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { synthesizeSuccess in
                DispatchQueue.main.async {
                    self.sendTestResponse(withRequestId: pressKeyAction.requestId, type: pressKeyAction.type, success: synthesizeSuccess)
                }
            }
            return // Early return since we're handling async
        case "left", "leftarrow", "remote_left":
            // For left arrow
            var eventPath = PointerEventPath.pathForTextInput()
            eventPath.typeKey(XCUIKeyboardKey.leftArrow.rawValue)
            let eventRecord = EventRecord(orientation: .portrait)
            _ = eventRecord.add(eventPath)
            RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { synthesizeSuccess in
                DispatchQueue.main.async {
                    self.sendTestResponse(withRequestId: pressKeyAction.requestId, type: pressKeyAction.type, success: synthesizeSuccess)
                }
            }
            return // Early return since we're handling async
        case "right", "rightarrow", "remote_right":
            // For right arrow
            var eventPath = PointerEventPath.pathForTextInput()
            eventPath.typeKey(XCUIKeyboardKey.rightArrow.rawValue)
            let eventRecord = EventRecord(orientation: .portrait)
            _ = eventRecord.add(eventPath)
            RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { synthesizeSuccess in
                DispatchQueue.main.async {
                    self.sendTestResponse(withRequestId: pressKeyAction.requestId, type: pressKeyAction.type, success: synthesizeSuccess)
                }
            }
            return // Early return since we're handling async
        default:
            success = false
            message = "Unsupported key: \(keyString)"
        }
        
        // Send response for non-keyboard keys
        if !message.isEmpty {
            print("PressKey error: \(message)")
        }
        self.sendTestResponse(withRequestId: pressKeyAction.requestId, type: pressKeyAction.type, success: success)
    }
    
    func performTapAction(_ tapAction: TapAction) {
//        let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
        self.performTap(point: tapAction.point) { [weak self] success in
            DispatchQueue.main.async {
                self?.sendTestResponse(withRequestId: tapAction.requestId, type: tapAction.type, success: success)
            }
        }
    }
    
    func getDeviceScale(_ deviceScale: GetDeviceScaleAction) {
        // Get the device scale from UIScreen
        let scale = UIScreen.main.scale
        
        // Create response data with scale
        let responseData = ActionResponseData(
            type: deviceScale.type,
            screenshot: nil,
            screenWidth: nil,
            screenHeight: nil,
            hierarchy: nil,
            orientation: nil,
            x: nil,
            y: nil,
            scale: Float(scale)
        )
        
        // Create and send the response
        let testResponse = ActionResponse(
            requestId: deviceScale.requestId,
            type: deviceScale.type,
            success: true,
            message: nil,
            data: responseData
        )
        
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            let jsonData = try encoder.encode(testResponse)
            let jsonString = String(data: jsonData, encoding: .utf8) ?? ""
            self.delegate?.sendXCTestResponse(jsonString: jsonString, completion: { success in
                if success {
                    print("Device scale response sent successfully: \(deviceScale)")
                }
            })
        } catch let error {
            print("failure due to \(error.localizedDescription)")
        }
    }
    
    func performEnterTextAction(_ enterTextAction: EnterTextAction) {
        let enterTextValue = enterTextAction.value
        print("enterValue request: \(enterTextValue)")
        let appId = self.getForegroundAppId(XCViewHierarchyManager.availableAppIds)
        guard let appId = appId else { return }
        let app = XCUIApplication(bundleIdentifier: appId)
        let keyboard = app.keyboards.firstMatch
//        let deleteCount = targetNode?.value?.count ?? testRequest.deleteCount ?? 0
//        let deleteText = String(repeating: XCUIKeyboardKey.delete.rawValue, count: deleteCount)
        if keyboard.exists {
            if enterTextAction.shouldEraseText {
                // Delete characters first based on eraseCount (default 100)
                let deleteCount = enterTextAction.effectiveEraseCount
                let deleteText = String(repeating: XCUIKeyboardKey.delete.rawValue, count: deleteCount)
                print("Clearing text with \(deleteCount) delete keys")
                
                TextInputHelper.inputText(deleteText) { [weak self] success in
                    if success {
                        print("Entering: \(enterTextValue)")
                        TextInputHelper.inputText(enterTextValue) { [weak self] success in
                            DispatchQueue.main.async {
                                self?.sendTestResponse(withRequestId: enterTextAction.requestId, type: enterTextAction.type, success: success)
                            }
                        }
                    } else {
                        DispatchQueue.main.async {
                            self?.sendTestResponse(withRequestId: enterTextAction.requestId, type: enterTextAction.type, success: false)
                        }
                    }
                }
            } else {
                // Just enter the text without clearing
                print("Entering: \(enterTextValue)")
                TextInputHelper.inputText(enterTextValue) { [weak self] success in
                    DispatchQueue.main.async {
                        self?.sendTestResponse(withRequestId: enterTextAction.requestId, type: enterTextAction.type, success: success)
                    }
                }
            }
        }
    }
    
    func performScrollAction(_ scrollAction: ScrollAction) {
        let x1 = CGFloat(scrollAction.x1)
        let y1 = CGFloat(scrollAction.y1)
        let x2 = CGFloat(scrollAction.x2)
        let y2 = CGFloat(scrollAction.y2)
        let duration = Double(scrollAction.duration)/1000 // convert to seconds.
        self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
            DispatchQueue.main.async {
                self?.sendTestResponse(withRequestId: scrollAction.requestId, type: scrollAction.type, success: success)
            }
        }
    }
    
    private func prepareForTest(_ testRequest: Action) {

//        if isDeviceAction(in: testRequest) {
//            // Perform any Device Action from the testRequest.
//            self.performDeviceAction(with: testRequest)
//        } else if testRequest.action == constant_executeTestStep {
//            // Perform any Test Command from the testRequest.
//            let testCommand = XCTestCommand(rawValue: testRequest.cmd ?? "")
//            if testCommand == .HomeScreen || testCommand == .ScrollUp || testCommand == .ScrollDown || testCommand == .ScrollLeft || testCommand == .ScrollRight {
//                // No need of targetNode for these test commands.
//                self.performTestStep(with: testRequest, and: nil)
//            } else {
//                // Otherwise targetNode is required.
//                guard findNodeTimer == nil else {
//                    return
//                }
//                guard testRequest.mobileScrollInfo == nil else {
//                    self.performTestStep(with: testRequest, and: nil)
//                    return
//                }
//                guard testRequest.screenClickInfo == nil else {
//                    self.performTestStep(with: testRequest, and: nil)
//                    return
//                }
//                findNodeTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true, block: { [weak self] _ in
//                    self?.findNodeUntilTimeout(with: testRequest, completion: { [weak self] (success, targetNode) in
//                        DispatchQueue.main.async {
//                            self?.invalidateTestTimer()
//                            if success {
//                                self?.performTestStep(with: testRequest, and: targetNode)
//                            } else {
//                                let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//                                self?.sendTestResponse(withTestRequest: testRequest, success: false, node: targetNode, screenshot: screenshotBase64String)
//                            }
//                        }
//                    })
//                })
//            }
//        } else if testRequest.action == XCTestCommand.Stop.rawValue {
//            // Set stopTest to true from the testRequest.
//            self.stopTest = true
//        }
    }
    
    private func invalidateTestTimer() {
        findNodeTimer?.invalidate()
        findNodeTimer = nil
    }
//    
//    private func findNodeUntilTimeout(with testRequest: XCTestRequest, completion: TargetNodeCallBack) {
//        
//        if let targetNode = getMatchingNode(nodeIdentifier: testRequest.nodeIdentifier) {
//            completion(true, targetNode)
//            return
//        }
//        if let timeoutStartTime = timeoutStartTime {
//            let timeoutEndTime = Int(Date().timeIntervalSince1970 - timeoutStartTime)
//            if timeoutEndTime >= (testRequest.timeout ?? 10) {
//                self.timeoutStartTime = nil
//                completion(false, nil)
//                return
//            }
//        }
//    }
//    
//    private func isDeviceAction(in testRequest: XCTestRequest) -> Bool {
//        if testRequest.action == XCTestCommand.HomeScreen.rawValue || testRequest.action == XCTestCommand.ScrollUp.rawValue || testRequest.action == XCTestCommand.ScrollDown.rawValue || testRequest.action == XCTestCommand.Swipe.rawValue {
//            return true
//        }
//        return false
//    }
//    
//    private func performDeviceAction(with testRequest: XCTestRequest) {
//        
//        switch XCTestCommand(rawValue: testRequest.action ?? "") {
//        case .HomeScreen: XCUIDevice.shared.press(.home)
//        case .LockScreen: XCUIDevice.shared.perform(NSSelectorFromString("pressLockButton"))
//        case .Swipe:
//            let eventRecord = EventRecord(orientation: .portrait)
//            _ = eventRecord.addSwipeEvent(start: CGPoint(x: testRequest.swipeData?.x1 ?? 0, y: testRequest.swipeData?.y1 ?? 0), end: CGPoint(x: testRequest.swipeData?.x2 ?? 0, y: testRequest.swipeData?.y2 ?? 0), duration: Double((testRequest.swipeData?.duration ?? 0)/1000))
//
//            RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { success in
//                if success {
//
//                }
//            }
//        case .ScrollUp:
//            let startYMultiplier: CGFloat = 0.75
//            let endYMultiplier: CGFloat = 1.0
//            let x1 = 0.0
//            let y1 = UIScreen.main.bounds.height*startYMultiplier
//            let x2 = 0.0
//            let y2 = UIScreen.main.bounds.height*endYMultiplier
//            let duration = 0.2
//            self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { success in
//                if success {
//
//                }
//            }
//        case .ScrollDown:
//            let startYMultiplier: CGFloat = 0.75
//            let endYMultiplier: CGFloat = 0.5
//            let x1 = 0.0
//            let y1 = UIScreen.main.bounds.height*startYMultiplier
//            let x2 = 0.0
//            let y2 = UIScreen.main.bounds.height*endYMultiplier
//            let duration = 0.2
//            self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { success in
//                if success {
//
//                }
//            }
//        default: print("")
//        }
//    }
//    
//    func performTestStep(with testRequest: XCTestRequest, and targetNode: XCViewHierarchy?) {
//        if stopTest {
//            stopTest = false
//            return
//        }
//        if let timeoutStartTime = timeoutStartTime {
//            let timeoutEndTime = Int(Date().timeIntervalSince1970 - timeoutStartTime)
//            if timeoutEndTime >= (testRequest.timeout ?? 10) {
//                self.timeoutStartTime = nil
//                let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//                self.sendTestResponse(withTestRequest: testRequest, success: false, node: nil, screenshot: screenshotBase64String)
//                return
//            }
//        }
//        switch XCTestCommand(rawValue: testRequest.cmd ?? "") {
//        case .HomeScreen:
//            XCUIDevice.shared.press(.home)
//            self.sendTestResponse(withTestRequest: testRequest, success: true, node: targetNode, screenshot: nil)
//        case .Tap:
//            let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//            self.performTap(targetNode: targetNode ?? XCViewHierarchy([:], uuid: nil, parentUUID: nil, children: nil), clickPoint: testRequest.clickInfo, screenClickInfo: testRequest.screenClickInfo) { [weak self] success in
//                DispatchQueue.main.async {
//                    self?.sendTestResponse(withTestRequest: testRequest, success: success, node: targetNode, screenshot: screenshotBase64String)
//                }
//            }
//        case .ValidateText, .ValidateElement:
//            guard let targetNode = targetNode else { return }
//            let assertWidth = (targetNode.bounds?.right ?? 0.0) > 0
//            let assertHeight = (targetNode.bounds?.bottom ?? 0.0) > 0
//            var asserts = false
//            var failedReason = ""
//            let matched = (targetNode.identifier?.isEmpty ?? false) ? (targetNode.label ?? targetNode.value ?? targetNode.title ?? targetNode.placeholderValue) : targetNode.identifier
//            switch testRequest.assertType {
//            case .isVisible: asserts = true
//            case .equals:
//                if let assertTextValue = testRequest.assertTextValue,  targetNode.label == assertTextValue {
//                    asserts = true
//                } else {
//                    let failedReasonObject = FailedReason(type: "textEquals", message: "Found matching node but text is not matching. Found \(targetNode.label ?? "null") instead of \(testRequest.assertTextValue ?? "null")", matched: ["\(matched ?? "unknown")"], unmatched: [testRequest.assertTextValue ?? "unknown"])
//                    failedReason = failedReasonObject.toString()
//                }
//            case .contains:
//                if let assertTextValue = testRequest.assertTextValue,  targetNode.label?.contains(assertTextValue) ?? false {
//                    asserts = true
//                } else {
//                    let failedReasonObject = FailedReason(type: "textContains", message: "Found matching node but \(targetNode.label ?? "null") doesn't contain \(testRequest.assertTextValue ?? "null")", matched: ["\(matched ?? "unknown")"], unmatched: [testRequest.assertTextValue ?? "unknown"])
//                    failedReason = failedReasonObject.toString()
//                }
//            case .startsWith:
//                if let assertTextValue = testRequest.assertTextValue,  targetNode.label?.starts(with: assertTextValue) ?? false {
//                    asserts = true
//                } else {
//                    let failedReasonObject = FailedReason(type: "textStartsWith", message: "Found matching node but \(targetNode.label ?? "null") doesn't start with \(testRequest.assertTextValue ?? "null")", matched: ["\(matched ?? "unknown")"], unmatched: [testRequest.assertTextValue ?? "unknown"])
//                    failedReason = failedReasonObject.toString()
//                }
//            case .endsWith:
//                if let assertTextValue = testRequest.assertTextValue, targetNode.label?.hasSuffix(assertTextValue) ?? false {
//                    asserts = true
//                } else {
//                    let failedReasonObject = FailedReason(type: "textEndsWith", message: "Found matching node but \(targetNode.label ?? "null") doesn't end with \(testRequest.assertTextValue ?? "null")", matched: ["\(matched ?? "unknown")"], unmatched: [testRequest.assertTextValue ?? "unknown"])
//                    failedReason = failedReasonObject.toString()
//                }
//            case .isChecked:
//                if targetNode.elementType == ElementType.UISwitch.rawValue && targetNode.value == "1" {
//                    asserts = true
//                } else {
//                    let failedReasonObject = FailedReason(type: "isChecked", message: "Found matching node but target node is not Checked", matched: ["\(matched ?? "unknown")"], unmatched: [targetNode.value ?? "unknown"])
//                    failedReason = failedReasonObject.toString()
//                }
//            case .isNotChecked:
//                if targetNode.elementType == ElementType.UISwitch.rawValue && targetNode.value == "0" {
//                    asserts = true
//                } else {
//                    let failedReasonObject = FailedReason(type: "isNotChecked", message: "Found matching node but target node is Checked", matched: ["\(matched ?? "unknown")"], unmatched: [targetNode.value ?? "unknown"])
//                    failedReason = failedReasonObject.toString()
//                }
//            case .none:
//                break
//            }
//            let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//            self.sendTestResponse(withTestRequest: testRequest, success: assertWidth && assertHeight && asserts, failedReason: failedReason, node: targetNode, screenshot: screenshotBase64String)
//        case .EnterText:
//            guard let enterTextValue = testRequest.enterTextValue else { return }
//            print("enterValue request: \(enterTextValue)")
//            let appId = self.getForegroundAppId(XCViewHierarchyManager.availableAppIds)
//            guard let appId = appId else { return }
//            let app = XCUIApplication(bundleIdentifier: appId)
//            let keyboard = app.keyboards.firstMatch
//            let deleteCount = targetNode?.value?.count ?? testRequest.deleteCount ?? 0
//            let deleteText = String(repeating: XCUIKeyboardKey.delete.rawValue, count: deleteCount)
//            if keyboard.exists {
//                print("Deleting: \(deleteText)")
//                TextInputHelper.inputText(deleteText) { [weak self] success in
//                    if success {
//                        print("Entering: \(enterTextValue)")
//                        TextInputHelper.inputText(enterTextValue) { [weak self] success in
//                            DispatchQueue.main.async {
//                                let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//                                self?.sendTestResponse(withTestRequest: testRequest, success: success, node: targetNode, screenshot: screenshotBase64String)
//                            }
//                        }
//                    }
//                }
//            } else {
//                print("Tapping and Entering Text")
//                self.performTap(targetNode: targetNode ?? XCViewHierarchy([:], uuid: nil, parentUUID: nil, children: nil), clickPoint: testRequest.clickInfo, screenClickInfo: testRequest.screenClickInfo) { [weak self] success in
//                    if success {
//                        print("Deleting: \(deleteText)")
//                        TextInputHelper.inputText(deleteText) { [weak self] success in
//                            if success {
//                                print("Entering: \(enterTextValue)")
//                                TextInputHelper.inputText(enterTextValue) { [weak self] success in
//                                    DispatchQueue.main.async {
//                                        let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//                                        self?.sendTestResponse(withTestRequest: testRequest, success: success, node: targetNode, screenshot: screenshotBase64String)
//                                    }
//                                }
//                            }
//                        }
//                    }
//                }
//            }
//        case .HScroll, .VScroll:
//            let x1 = CGFloat(testRequest.mobileScrollInfo?.startX ?? 0)
//            let y1 = CGFloat(testRequest.mobileScrollInfo?.startY ?? 0)
//            let x2 = CGFloat(testRequest.mobileScrollInfo?.endX ?? 0)
//            let y2 = CGFloat(testRequest.mobileScrollInfo?.endY ?? 0)
//            let duration = Double(testRequest.mobileScrollInfo?.durationInMs ?? 500)/1000 // convert to seconds.
//            self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
//                DispatchQueue.main.async {
//                    let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//                    self?.sendTestResponse(withTestRequest: testRequest, success: true, node: targetNode, screenshot: screenshotBase64String)
//                }
//            }
//        case .ScrollUp:
//            if let targetNode = getMatchingNode(nodeIdentifier: testRequest.nodeIdentifier) {
//                let x = targetNode.bounds?.left ?? 0
//                let y = targetNode.bounds?.top ?? 0
//                let width = (targetNode.bounds?.right ?? 0) - (targetNode.bounds?.left ?? 0)
//                let height = (targetNode.bounds?.bottom ?? 0) - (targetNode.bounds?.top ?? 0)
//                if self.isViewVisibleOnScreen(frame: CGRect(x: x, y: y, width: width, height: height), identifier: targetNode.identifier) {
//                    let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//                    self.sendTestResponse(withTestRequest: testRequest, success: true, node: targetNode, screenshot: screenshotBase64String)
//                } else {
//                    let x1 = 0.0
//                    let y1 = UIScreen.main.bounds.height*0.75
//                    let x2 = 0.0
//                    let y2 = UIScreen.main.bounds.height*0.8
//                    let duration = 0.2
//                    self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
//                        DispatchQueue.main.async {
//                            self?.performTestStep(with: testRequest, and: targetNode)
//                        }
//                    }
//                }
//            } else {
//                var startYMultiplier: CGFloat = 0.75
//                var endYMultiplier: CGFloat = 1.0
//                if let fromScroll = testRequest.fromScroll, let toScroll = testRequest.toScroll, toScroll > fromScroll {
//                    startYMultiplier = CGFloat(fromScroll)/100
//                    endYMultiplier = CGFloat(toScroll)/100
//                }
//                let x1 = 0.0
//                let y1 = UIScreen.main.bounds.height*startYMultiplier
//                let x2 = 0.0
//                let y2 = UIScreen.main.bounds.height*endYMultiplier
//                let duration = 0.2
//                self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
//                    DispatchQueue.main.async {
//                        self?.performTestStep(with: testRequest, and: targetNode)
//                    }
//                }
//            }
//        case .ScrollDown:
//            if let targetNode = getMatchingNode(nodeIdentifier: testRequest.nodeIdentifier) {
//                let x = targetNode.bounds?.left ?? 0
//                let y = targetNode.bounds?.top ?? 0
//                let width = (targetNode.bounds?.right ?? 0) - (targetNode.bounds?.left ?? 0)
//                let height = (targetNode.bounds?.bottom ?? 0) - (targetNode.bounds?.top ?? 0)
//                if self.isViewVisibleOnScreen(frame: CGRect(x: x, y: y, width: width, height: height), identifier: targetNode.identifier) {
//                    let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//                    self.sendTestResponse(withTestRequest: testRequest, success: true, node: targetNode, screenshot: screenshotBase64String)
//                } else {
//                    let x1 = 0.0
//                    let y1 = UIScreen.main.bounds.height*0.75
//                    let x2 = 0.0
//                    let y2 = UIScreen.main.bounds.height*0.7
//                    let duration = 0.2
//                    self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
//                        DispatchQueue.main.async {
//                            self?.performTestStep(with: testRequest, and: targetNode)
//                        }
//                    }
//                }
//            } else {
//                var startYMultiplier: CGFloat = 0.75
//                var endYMultiplier: CGFloat = 0.5
//                if let fromScroll = testRequest.fromScroll, let toScroll = testRequest.toScroll, fromScroll > toScroll {
//                    startYMultiplier = CGFloat(fromScroll)/100
//                    endYMultiplier = CGFloat(toScroll)/100
//                }
//                let x1 = 0.0
//                let y1 = UIScreen.main.bounds.height*startYMultiplier
//                let x2 = 0.0
//                let y2 = UIScreen.main.bounds.height*endYMultiplier
//                let duration = 0.2
//                self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
//                    DispatchQueue.main.async {
//                        self?.performTestStep(with: testRequest, and: targetNode)
//                    }
//                }
//            }
//        case .ScrollLeft:
//            if let targetNode = getMatchingNode(nodeIdentifier: testRequest.nodeIdentifier) {
//                let x = targetNode.bounds?.left ?? 0
//                let y = targetNode.bounds?.top ?? 0
//                let width = (targetNode.bounds?.right ?? 0) - (targetNode.bounds?.left ?? 0)
//                let height = (targetNode.bounds?.bottom ?? 0) - (targetNode.bounds?.top ?? 0)
//                if self.isViewVisibleOnScreen(frame: CGRect(x: x, y: y, width: width, height: height), identifier: targetNode.identifier) {
//                    let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//                    self.sendTestResponse(withTestRequest: testRequest, success: true, node: targetNode, screenshot: screenshotBase64String)
//                } else {
//                    let x1 = UIScreen.main.bounds.width*0.75
//                    let y1 = UIScreen.main.bounds.height/2
//                    let x2 = UIScreen.main.bounds.width*0.8
//                    let y2 = UIScreen.main.bounds.height/2
//                    let duration = 0.2
//                    self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
//                        DispatchQueue.main.async {
//                            self?.performTestStep(with: testRequest, and: targetNode)
//                        }
//                    }
//                }
//            } else {
//                var startXMultiplier: CGFloat = 0.75
//                var endXMultiplier: CGFloat = 1.0
//                if let fromScroll = testRequest.fromScroll, let toScroll = testRequest.toScroll, toScroll > fromScroll {
//                    startXMultiplier = CGFloat(fromScroll)/100
//                    endXMultiplier = CGFloat(toScroll)/100
//                }
//                let x1 = UIScreen.main.bounds.width*startXMultiplier
//                let y1 = UIScreen.main.bounds.height/2
//                let x2 = UIScreen.main.bounds.width*endXMultiplier
//                let y2 = UIScreen.main.bounds.height/2
//                let duration = 0.2
//                self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
//                    DispatchQueue.main.async {
//                        self?.performTestStep(with: testRequest, and: targetNode)
//                    }
//                }
//            }
//        case .ScrollRight:
//            if let targetNode = getMatchingNode(nodeIdentifier: testRequest.nodeIdentifier) {
//                let x = targetNode.bounds?.left ?? 0
//                let y = targetNode.bounds?.top ?? 0
//                let width = (targetNode.bounds?.right ?? 0) - (targetNode.bounds?.left ?? 0)
//                let height = (targetNode.bounds?.bottom ?? 0) - (targetNode.bounds?.top ?? 0)
//                if self.isViewVisibleOnScreen(frame: CGRect(x: x, y: y, width: width, height: height), identifier: targetNode.identifier) {
//                    let screenshotBase64String = XCUIScreen.main.screenshot().getBase64EncodedString()
//                    self.sendTestResponse(withTestRequest: testRequest, success: true, node: targetNode, screenshot: screenshotBase64String)
//                } else {
//                    let x1 = UIScreen.main.bounds.width*0.75
//                    let y1 = UIScreen.main.bounds.height/2
//                    let x2 = UIScreen.main.bounds.width*0.7
//                    let y2 = UIScreen.main.bounds.height/2
//                    let duration = 0.2
//                    self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
//                        DispatchQueue.main.async {
//                            self?.performTestStep(with: testRequest, and: targetNode)
//                        }
//                    }
//                }
//            } else {
//                var startXMultiplier: CGFloat = 0.75
//                var endXMultiplier: CGFloat = 0.5
//                if let fromScroll = testRequest.fromScroll, let toScroll = testRequest.toScroll, fromScroll > toScroll {
//                    startXMultiplier = CGFloat(fromScroll)/100
//                    endXMultiplier = CGFloat(toScroll)/100
//                }
//                let x1 = UIScreen.main.bounds.width*startXMultiplier
//                let y1 = UIScreen.main.bounds.height/2
//                let x2 = UIScreen.main.bounds.width*endXMultiplier
//                let y2 = UIScreen.main.bounds.height/2
//                let duration = 0.2
//                self.performSwipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration) { [weak self] success in
//                    DispatchQueue.main.async {
//                        self?.performTestStep(with: testRequest, and: targetNode)
//                    }
//                }
//            }
//        default: print("")
//        }
//    }
//    
    func performTap(point: Point, completion: @escaping SuccessCallBack) {
        let eventRecord = EventRecord(orientation: .portrait)
        _ = eventRecord.addPointerTouchEvent(
            at: CGPoint(x: point.x, y: point.y),
            touchUpAfter: 0.1
        )
        let start = Date()
        RunnerDaemonProxy().synthesize(eventRecord: eventRecord, completion: { success in
            let duration = Date().timeIntervalSince(start)
            print("Tapping took \(duration)")
            completion(success)
        })
    }
    
    func performSwipe(with orientation: UIInterfaceOrientation = .portrait, style: EventRecord.Style = .singeFinger, x1: CGFloat, y1: CGFloat, x2: CGFloat, y2: CGFloat, duration: Double, completion: @escaping SuccessCallBack) {
        let eventRecord = EventRecord(orientation: orientation, style: style)
        _ = eventRecord.addSwipeEvent(start: CGPoint(x: x1, y: y1), end: CGPoint(x: x2, y: y2), duration: duration)
        RunnerDaemonProxy().synthesize(eventRecord: eventRecord) { success in
            completion(success)
        }
    }
//    
//    func isViewVisibleOnScreen(frame: CGRect, identifier: String?) -> Bool {
//        guard let appId = getForegroundAppId(XCViewHierarchyManager.availableAppIds) else {
//            return false
//        }
//        let app = XCUIApplication(bundleIdentifier: appId)
//        let window = app.windows.firstMatch
//        
//        // Get the visible frame of the screen
//        let visibleFrame = window.frame
//        
//        // Check if the view's frame intersects with the visible frame
//        let isVisible = visibleFrame.intersects(frame)
//        
////        if !isVisible {
////            // Get the frame of the view you want to check (Assuming you know its accessibility identifier)
////            guard let identifier = identifier else {
////                return isVisible
////            }
////            let view = app.otherElements[identifier]
////            isVisible = visibleFrame.intersects(view.frame)
////        }
//        
//        return isVisible
//    }
//    
    private func getForegroundAppId(_ appIds: [String]) -> String? {
        if appIds.isEmpty {
            return nil
        }
        return appIds.first { appId in
            let app = XCUIApplication(bundleIdentifier: appId)
            return app.state == .runningForeground
        }
    }
    
    private func getForegroundApp(_ runningAppIds: [String]) -> XCUIApplication? {
        runningAppIds
            .map { XCUIApplication(bundleIdentifier: $0) }
            .first { app in app.state == .runningForeground }
    }
//    
//    private func waitUntilKeyboardIsPresented(completion: @escaping SuccessCallBack) {
//        let appId = self.getForegroundAppId(XCViewHierarchyManager.availableAppIds)
//        guard let appId = appId else { return }
//        repeat {
//            print("Waiting")
//        } while !XCUIApplication(bundleIdentifier: appId).keyboards.firstMatch.exists
//        completion(true)
//    }
//    
    func sendTestResponse(withRequestId requestId: String, type: String, success: Bool) {
//        var failedReason = failedReason
//        if !success && node?.bounds == nil {
//            let unmatched = testRequest.nodeIdentifier?.srcNodeAttr?.label ?? testRequest.nodeIdentifier?.dstNodeAttr?.label ?? testRequest.nodeIdentifier?.connectingNodeAttr?.label
//            let failedReasonObject = FailedReason(type: "identifier", message: "Couldn't find the target to perform \(testRequest.cmd ?? "unknown")", matched: [], unmatched: ["\(unmatched ?? "unknown")"])
//            failedReason = failedReasonObject.toString()
//        }
//        let testResponse = XCTestResponse(action: testRequest.action, response: ResponseData(stepId: testRequest.stepId, testId: testRequest.testId, testExecutionId: testRequest.testExecutionId, testGroupId: testRequest.testGroupId, success: success, code: nil, message: nil, screenshot: screenshot, failedReason: failedReason, node_bounds: node?.bounds ?? testRequest.screenClickInfo?.boundsToXCBounds(), screenHeight: XCUIDevice.shared.orientation.isLandscape ? Int(XCViewHierarchyManager.screenSize?.width ?? 0) : Int(XCViewHierarchyManager.screenSize?.height ?? 0), screenWidth: XCUIDevice.shared.orientation.isLandscape ? Int(XCViewHierarchyManager.screenSize?.height ?? 0) : Int(XCViewHierarchyManager.screenSize?.width ?? 0)))
        
        let testResponse = ActionResponse(requestId: requestId, type: type, success: success, message: nil, data: nil)
        
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            let jsonData = try encoder.encode(testResponse)
            let jsonString = String(data: jsonData, encoding: .utf8) ?? ""
            self.delegate?.sendXCTestResponse(jsonString: jsonString, completion: { success in
                if success {
                    
                }
            })
        } catch let error {
            print("failure due to \(error.localizedDescription)")
        }
    }
    
    //    func getTargetNode(from testRequest: XCTestRequest) -> XCViewHierarchy? {
    //
    //        let identifier = testRequest.actionIdentifier?.identifier
    //        let label = testRequest.actionIdentifier?.label
    //        let title = testRequest.actionIdentifier?.title
    //        let elementType = testRequest.actionIdentifier?.elementType
    //
    //        let flattenedHierarchy = XCViewHierarchyManager.flattenedHierarchy
    //
    //        var targetNodes = [XCViewHierarchy]()
    //
    //        for node in flattenedHierarchy {
    //            var numberOfIdentifiers = 0
    //            var numberOfIdentifiersMatched = 0
    //            if let identifier = identifier {
    //                numberOfIdentifiers += 1
    //                if let nodeIdentifier = node.identifier, identifier == nodeIdentifier {
    //                    numberOfIdentifiersMatched += 1
    //                }
    //            }
    //            if let label = label {
    //                numberOfIdentifiers += 1
    //                if let nodeLabel = node.label, label == nodeLabel {
    //                    numberOfIdentifiersMatched += 1
    //                }
    //            }
    //            if let title = title {
    //                numberOfIdentifiers += 1
    //                if let nodeTitle = node.title, title == nodeTitle {
    //                    numberOfIdentifiersMatched += 1
    //                }
    //            }
    //            if let elementType = elementType {
    //                numberOfIdentifiers += 1
    //                if let nodeElementType = node.elementType, elementType == nodeElementType {
    //                    numberOfIdentifiersMatched += 1
    //                }
    //            }
    //            if numberOfIdentifiers > 0 && numberOfIdentifiersMatched == numberOfIdentifiers {
    //                targetNodes.append(node)
    //            }
    //        }
    //
    //        let count = testRequest.actionIdentifier?.count
    //
    //        for (index, targetNode) in targetNodes.enumerated() {
    //            if let count = count, count == index {
    //                print("Found the node")
    //                return targetNode
    //            }
    //        }
    //        return nil
    //    }
}
