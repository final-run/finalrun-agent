//
//  TextInputHelper.swift
//  finalrun-ios-test
//
//  Created by Ajay S on 04/03/24.
//

import Foundation
import os

struct TextInputHelper {
    
    private enum Constants {
        static let typingFrequency = 30
        static let slowInputCharactersCount = 1
    }
        
    static func inputText(_ text: String, completion: @escaping SuccessCallBack) {
        // due to different keyboard input listener events (i.e. autocorrection or hardware keyboard connection)
        // characters after the first on are often skipped, so we'll input it with lower typing frequency
        print("TextInputHelper: Starting text input")
        print("Text length: \(text.count) characters")
        print("Typing speed: 100")
        
        var eventPath = PointerEventPath.pathForTextInput()
        eventPath.type(text: text, typingSpeed: 100)
        let eventRecord = EventRecord(orientation: .portrait)
        _ = eventRecord.add(eventPath)
        
        print("TextInputHelper: Synthesizing event record")
        RunnerDaemonProxy().synthesize(eventRecord: eventRecord, completion: { success in
            print("TextInputHelper: Event synthesis completed with success: \(success)")
            completion(success)
        })
    }
}

